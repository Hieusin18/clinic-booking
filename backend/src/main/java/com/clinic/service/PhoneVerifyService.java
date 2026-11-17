package com.clinic.service;

import com.clinic.config.AppEnv;
import com.clinic.dto.auth.StartVerificationRequest;
import com.clinic.entity.InboundSms;
import com.clinic.entity.PhoneVerification;
import com.clinic.entity.User;
import com.clinic.entity.enums.PhoneVerifyPurpose;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.InboundSmsRepository;
import com.clinic.repository.PhoneVerificationRepository;
import com.clinic.repository.UserRepository;
import com.clinic.util.PhoneVerify;
import com.clinic.view.Json;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Xác minh số điện thoại kiểu "nhắn tin để xác thực" (giống Zalo): thay vì phòng khám nhắn OTP đi (tốn tiền,
 * kẻ xấu bấm "gửi mã" liên tục là phòng khám mất tiền), NGƯỜI DÙNG nhắn mã từ chính SIM của họ tới số của
 * phòng khám. Bằng chứng chính chủ là SỐ NGƯỜI GỬI, mã chỉ để nối tin nhắn với đúng phiên.
 * <ol>
 *   <li>App: POST /auth/phone-verifications {phone, purpose} → {id, ticket, code, smsTo, smsBody, expiresAt}</li>
 *   <li>Người dùng nhắn "PKXM &lt;mã&gt;" tới smsTo (app mở sẵn màn soạn tin)</li>
 *   <li>Cổng SMS chuyển tin tới POST /sms/inbound: iPhone Phím tắt (header X-Gateway-Token) hoặc
 *       Android SMS Gateway (chữ ký HMAC-SHA256 X-Signature, X-Timestamp)</li>
 *   <li>Mã đúng VÀ số gửi trùng số khai báo → phiên "đã xác minh"; app hỏi trạng thái (kèm ticket) rồi dùng phiên để
 *       đăng ký (POST /auth/register) hoặc đặt lại mật khẩu (POST /auth/reset-password).</li>
 * </ol>
 */
@Service
public class PhoneVerifyService {
  /** Phiên chờ tin nhắn trong bấy nhiêu phút */
  public static final int VERIFY_TTL_MINUTES = 10;
  /** Đã xác minh thì phải dùng (đăng ký / đặt mật khẩu) trong bấy nhiêu phút */
  public static final int USE_WITHIN_MINUTES = 30;
  /** Tạo phiên: tối đa theo số điện thoại / theo IP trong một giờ */
  public static final int MAX_PER_PHONE_HOUR = 10;
  public static final int MAX_PER_IP_HOUR = 30;

  private static final long MINUTE = 60;
  private static final Logger log = LoggerFactory.getLogger("PhoneVerify");
  private static final SecureRandom RANDOM = new SecureRandom();

  private final PhoneVerificationRepository verifications;
  private final InboundSmsRepository inbound;
  private final UserRepository users;
  private final AppEnv env;
  private final ObjectMapper mapper;

  public PhoneVerifyService(PhoneVerificationRepository verifications, InboundSmsRepository inbound, UserRepository users, AppEnv env, ObjectMapper mapper) {
    this.verifications = verifications;
    this.inbound = inbound;
    this.users = users;
    this.env = env;
    this.mapper = mapper;
  }

  /** Bật / tắt yêu cầu xác minh số khi đăng ký (mặc định bật; tắt bằng REQUIRE_PHONE_VERIFICATION=false) */
  public boolean required() {
    return !env.isFalse("REQUIRE_PHONE_VERIFICATION");
  }

  /** Số nhận tin của phòng khám (số SIM của máy cổng) */
  public String smsTo() {
    return env.get("SMS_VERIFY_NUMBER");
  }

  @Transactional
  public Map<String, Object> start(StartVerificationRequest dto, String ip, Instant now) {
    Instant hourAgo = now.minusSeconds(60 * MINUTE);
    long byPhone = verifications.countByPhoneAndCreatedAtGreaterThanEqual(dto.phone(), hourAgo);
    long byIp = verifications.countByIpAndCreatedAtGreaterThanEqual(ip, hourAgo);
    if (byPhone >= MAX_PER_PHONE_HOUR || byIp >= MAX_PER_IP_HOUR) {
      throw ApiException.tooMany("Bạn đã yêu cầu xác minh quá nhiều lần, vui lòng thử lại sau");
    }
    User account = users.findByPhone(dto.phone()).orElse(null);
    if (dto.purpose() == PhoneVerifyPurpose.REGISTER && account != null) {
      throw ApiException.conflict("Số điện thoại đã có tài khoản. Nếu quên mật khẩu, hãy chọn \"Quên mật khẩu\".");
    }
    if (dto.purpose() == PhoneVerifyPurpose.RESET_PASSWORD) {
      if (account == null) throw ApiException.notFound("Số điện thoại này chưa có tài khoản");
      if (account.getRole() != Role.PATIENT) throw ApiException.badRequest("Nhân viên quên mật khẩu vui lòng liên hệ quản trị viên");
    }

    // Mã 6 số không trùng với phiên khác đang chờ (để một tin nhắn chỉ khớp đúng một phiên)
    String code = "";
    for (int i = 0; i < 20; i++) {
      code = String.format("%06d", RANDOM.nextInt(1_000_000));
      if (verifications.countByCodeAndVerifiedAtIsNullAndExpiresAtAfter(code, now) == 0) break;
    }
    byte[] raw = new byte[24];
    RANDOM.nextBytes(raw);
    String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    PhoneVerification v = new PhoneVerification();
    v.setPhone(dto.phone());
    v.setPurpose(dto.purpose());
    v.setCode(code);
    v.setTicketHash(PhoneVerify.sha256(ticket));
    v.setIp(ip);
    v.setExpiresAt(now.plusSeconds(VERIFY_TTL_MINUTES * MINUTE));
    v.setCreatedAt(now);
    verifications.save(v);
    return Json.obj("id", v.getId(), "ticket", ticket, "code", code, "smsTo", smsTo(), "smsBody", PhoneVerify.SMS_PREFIX + " " + code,
        "expiresAt", v.getExpiresAt());
  }

  @Transactional(readOnly = true)
  public Map<String, Object> status(String id, String ticket, Instant now) {
    PhoneVerification v = verifications.findById(id).orElse(null);
    if (v == null || !PhoneVerify.safeEqual(v.getTicketHash(), PhoneVerify.sha256(ticket))) {
      throw ApiException.notFound("Không tìm thấy phiên xác minh");
    }
    String status = v.getVerifiedAt() != null ? "VERIFIED" : !v.getExpiresAt().isAfter(now) ? "EXPIRED" : "PENDING";
    return Json.obj("status", status, "phone", v.getPhone(), "expiresAt", v.getExpiresAt());
  }

  /**
   * Dùng một phiên đã xác minh (đăng ký / đặt lại mật khẩu): đúng vé, đúng mục đích, đúng số, chưa dùng, xác minh
   * chưa quá 30 phút. Đánh dấu đã dùng nên không dùng lại được. Chạy trong transaction của nơi gọi.
   */
  public void consume(String verificationId, String ticket, PhoneVerifyPurpose purpose, String phone, Instant now) {
    ApiException invalid = ApiException.badRequest("Số điện thoại chưa được xác minh hoặc phiên xác minh đã hết hạn, vui lòng xác minh lại");
    if (verificationId == null || verificationId.isEmpty() || ticket == null || ticket.isEmpty()) throw invalid;
    PhoneVerification row = verifications.findById(verificationId).orElse(null);
    if (row == null
        || !PhoneVerify.safeEqual(row.getTicketHash(), PhoneVerify.sha256(ticket))
        || row.getPurpose() != purpose
        || !row.getPhone().equals(phone)
        || row.getVerifiedAt() == null
        || row.getUsedAt() != null
        || row.getVerifiedAt().isBefore(now.minusSeconds(USE_WITHIN_MINUTES * MINUTE))) {
      throw invalid;
    }
    if (verifications.markUsed(row.getId(), now) != 1) throw invalid;
  }

  /** Một tin nhắn từ cổng SMS (hoặc giả lập): khớp mã + số người gửi thì xác minh phiên tương ứng. */
  @Transactional
  public Map<String, Object> handleInbound(String source, String fromRaw, String body, Instant now) {
    String phone = PhoneVerify.normalizePhone(fromRaw);
    String code = PhoneVerify.codeIn(body);
    String result = "NO_MATCH";
    String verificationId = null;
    if (phone == null) {
      // Người gửi là email (iMessage) hoặc tên danh bạ: không chứng minh được số điện thoại
      result = "INVALID_SENDER";
    } else if (code != null) {
      List<PhoneVerification> candidates = verifications.findByCodeAndVerifiedAtIsNullAndExpiresAtAfter(code, now);
      PhoneVerification match = candidates.stream().filter(c -> c.getPhone().equals(phone)).findFirst().orElse(null);
      if (match != null) {
        match.setVerifiedAt(now);
        result = "VERIFIED";
        verificationId = match.getId();
      } else if (!candidates.isEmpty()) {
        // Mã đúng nhưng tin gửi từ số khác: có thể ai đó đang khai số của người khác
        result = "WRONG_SENDER";
      }
    }
    InboundSms sms = new InboundSms();
    sms.setSource(source);
    sms.setFromRaw(truncate(fromRaw, 80));
    sms.setPhone(phone);
    sms.setBody(truncate(body, 320));
    sms.setResult(result);
    sms.setVerificationId(verificationId);
    sms.setReceivedAt(now);
    inbound.save(sms);
    log.info("Tin nhắn {} từ {}: {}", source, phone != null ? phone : fromRaw, result);
    return Json.obj("ok", true, "result", result);
  }

  private static String truncate(String s, int max) {
    return s.length() <= max ? s : s.substring(0, max);
  }

  // ---- Cho admin ----

  @Transactional(readOnly = true)
  public List<Map<String, Object>> recentInbound(Integer limit) {
    return inbound.recent(PageRequest.of(0, limit == null ? 50 : limit)).stream()
        .map(s -> Json.obj("id", s.getId(), "source", s.getSource(), "fromRaw", s.getFromRaw(), "phone", s.getPhone(),
            "body", s.getBody(), "result", s.getResult(), "verificationId", s.getVerificationId(), "receivedAt", s.getReceivedAt()))
        .toList();
  }

  public Map<String, Object> configView() {
    return Json.obj("smsTo", smsTo(), "iphoneShortcut", env.get("SMS_GATEWAY_TOKEN") != null,
        "androidGateway", env.get("SMS_GATEWAY_SIGNING_KEY") != null, "prefix", PhoneVerify.SMS_PREFIX);
  }

  // ---- Xác thực cổng SMS ----

  /** Tin nhắn cổng SMS đã đọc ra. */
  public record GatewayMessage(String source, String from, String body) {}

  /**
   * Tin từ cổng có thật không. iPhone Phím tắt: header X-Gateway-Token trùng SMS_GATEWAY_TOKEN.
   * Android SMS Gateway: X-Signature = HMAC-SHA256(thân gốc + X-Timestamp, SMS_GATEWAY_SIGNING_KEY), lệch ≤ 5 phút.
   */
  public GatewayMessage authenticate(byte[] rawBody, String signature, String timestamp, String gatewayToken, Instant now) {
    String token = env.get("SMS_GATEWAY_TOKEN");
    String key = env.get("SMS_GATEWAY_SIGNING_KEY");
    String raw = rawBody == null ? "" : new String(rawBody, StandardCharsets.UTF_8);
    if (signature != null && !signature.isEmpty() && timestamp != null && !timestamp.isEmpty() && key != null) {
      String expected = PhoneVerify.hmacHex(key, raw + timestamp);
      double ts;
      try {
        ts = Double.parseDouble(timestamp);
      } catch (NumberFormatException e) {
        ts = Double.NaN;
      }
      if (!PhoneVerify.safeEqual(signature.toLowerCase(), expected) || Double.isNaN(ts) || Math.abs(now.toEpochMilli() / 1000.0 - ts) > 300) {
        throw ApiException.unauthorized("Chữ ký cổng SMS không hợp lệ");
      }
      JsonNode payload = parse(raw);
      String event = payload.path("event").asText("");
      if (!event.isEmpty() && !"sms:received".equals(event)) throw ApiException.badRequest("Chỉ nhận sự kiện sms:received");
      return new GatewayMessage("ANDROID_GATEWAY", text(payload.path("payload").path("phoneNumber")), text(payload.path("payload").path("message")));
    }
    if (token != null && gatewayToken != null && !gatewayToken.isEmpty() && PhoneVerify.safeEqual(gatewayToken, token)) {
      JsonNode b = parse(raw);
      return new GatewayMessage("IOS_SHORTCUT", text(b.path("from")), text(b.path("body")));
    }
    throw ApiException.unauthorized("Cổng SMS chưa được xác thực");
  }

  private JsonNode parse(String raw) {
    try {
      JsonNode n = raw.isBlank() ? null : mapper.readTree(raw);
      return n == null ? mapper.createObjectNode() : n;
    } catch (Exception e) {
      return mapper.createObjectNode();
    }
  }

  /** Giống String(x ?? '') của bản cũ: thiếu thì chuỗi rỗng. */
  private static String text(JsonNode n) {
    if (n == null || n.isMissingNode() || n.isNull()) return "";
    return n.isValueNode() ? n.asText() : n.toString();
  }
}
