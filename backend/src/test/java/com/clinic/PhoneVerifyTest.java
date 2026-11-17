package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.InboundSms;
import com.clinic.entity.PhoneVerification;
import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import com.clinic.repository.InboundSmsRepository;
import com.clinic.repository.PhoneVerificationRepository;
import com.clinic.repository.PushTokenRepository;
import com.clinic.service.PhoneVerifyService;
import com.clinic.support.Api;
import com.clinic.support.IntegrationTest;
import com.clinic.util.PhoneVerify;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Xác minh số điện thoại bằng tin nhắn người dùng gửi đến")
class PhoneVerifyTest extends IntegrationTest {
  static final String PHONE = "0912345678";
  static final String TOKEN = "iphone-shortcut-secret-for-test";
  static final String KEY = "android-signing-key-for-test";

  @Autowired
  InboundSmsRepository inbound;
  @Autowired
  PhoneVerificationRepository verifications;
  @Autowired
  PushTokenRepository pushTokens;
  @Autowired
  PhoneVerifyService svc;

  static Map<String, Object> register(Object... extra) {
    Map<String, Object> m = new HashMap<>(Map.of("fullName", "Trần Văn B", "phone", PHONE, "password", "xuanhoa2026", "dateOfBirth", "1990-01-01", "gender", "MALE"));
    for (int i = 0; i < extra.length; i += 2) m.put((String) extra[i], extra[i + 1]);
    return m;
  }

  @BeforeAll
  static void gateway() {
    System.setProperty("SMS_GATEWAY_TOKEN", TOKEN);
    System.setProperty("SMS_GATEWAY_SIGNING_KEY", KEY);
    System.setProperty("SMS_VERIFY_NUMBER", "0988000999");
  }

  @AfterAll
  static void clearGateway() {
    System.clearProperty("SMS_GATEWAY_TOKEN");
    System.clearProperty("SMS_GATEWAY_SIGNING_KEY");
    System.clearProperty("SMS_VERIFY_NUMBER");
  }

  @BeforeEach
  void requireVerification() {
    System.setProperty("REQUIRE_PHONE_VERIFICATION", "true");
  }

  @AfterEach
  void noVerification() {
    System.setProperty("REQUIRE_PHONE_VERIFICATION", "false");
  }

  JsonNode start(String phone, String purpose) {
    return api.post("/api/auth/phone-verifications").send(Map.of("phone", phone, "purpose", purpose)).expect(201).body();
  }

  JsonNode start() {
    return start(PHONE, "REGISTER");
  }

  String status(JsonNode v) {
    return api.get("/api/auth/phone-verifications/" + v.get("id").asText() + "?ticket=" + v.get("ticket").asText()).expect(200).body().get("status").asText();
  }

  Api.Req fromIphone(String from, String body) {
    return api.post("/api/sms/inbound").header("X-Gateway-Token", TOKEN).send(Map.of("from", from, "body", body));
  }

  static String code(JsonNode v) {
    return v.get("code").asText();
  }

  Map<String, Object> withTicket(JsonNode v, Object... extra) {
    Map<String, Object> m = register(extra);
    m.put("verificationId", v.get("id").asText());
    m.put("ticket", v.get("ticket").asText());
    return m;
  }

  @Test
  @DisplayName("đăng ký: nhắn mã từ đúng số (qua iPhone Phím tắt) thì xác minh, rồi đăng ký được")
  void registerFlow() {
    JsonNode v = start();
    assertThat(v.get("smsTo").asText()).isEqualTo("0988000999");
    assertThat(v.get("smsBody").asText()).isEqualTo("PKXM " + code(v));
    assertThat(code(v)).matches("^\\d{6}$");
    assertThat(status(v)).isEqualTo("PENDING");

    // Không xác minh thì không đăng ký được
    assertThat(api.post("/api/auth/register").send(register()).expect(400).body().get("message").asText()).contains("chưa được xác minh");
    assertThat(api.post("/api/auth/register").send(withTicket(v)).expect(400).body().get("message").asText()).contains("chưa được xác minh");

    var res = fromIphone("+84 912 345 678", "pkxm " + code(v)).expect(200).body();
    assertThat(res.get("ok").asBoolean()).isTrue();
    assertThat(res.get("result").asText()).isEqualTo("VERIFIED");
    assertThat(res.size()).isEqualTo(2);
    assertThat(status(v)).isEqualTo("VERIFIED");

    api.post("/api/auth/register").send(withTicket(v)).expect(201);
    // Phiên đã dùng thì không dùng lại được
    api.post("/api/auth/register").send(withTicket(v, "phone", "0912345679")).expect(400);
  }

  @Test
  @DisplayName("kẻ xấu khai số của người khác: tin nhắn từ SIM của hắn bị từ chối")
  void wrongSender() {
    JsonNode v = start();
    assertThat(fromIphone("0909999999", "PKXM " + code(v)).expect(200).body().get("result").asText()).isEqualTo("WRONG_SENDER");
    // Người gửi là email (iMessage) thì không chứng minh được số
    assertThat(fromIphone("ke-xau@icloud.com", "PKXM " + code(v)).expect(200).body().get("result").asText()).isEqualTo("INVALID_SENDER");
    assertThat(fromIphone(PHONE, "PKXM 000000").expect(200).body().get("result").asText()).isEqualTo("NO_MATCH");
    assertThat(status(v)).isEqualTo("PENDING");
    // Không có vé thì không xem được trạng thái của phiên người khác
    api.get("/api/auth/phone-verifications/" + v.get("id").asText() + "?ticket=doan-bua").expect(404);
    List<InboundSms> log = inbound.findAll().stream().sorted(Comparator.comparing(InboundSms::getReceivedAt)).toList();
    assertThat(log).extracting(m -> m.getSource() + "/" + m.getResult())
        .containsExactly("IOS_SHORTCUT/WRONG_SENDER", "IOS_SHORTCUT/INVALID_SENDER", "IOS_SHORTCUT/NO_MATCH");
  }

  @Test
  @DisplayName("cổng SMS phải xác thực: sai mã bí mật hoặc không có thì 401; Android ký HMAC thì nhận")
  void gatewayAuth() {
    JsonNode v = start();
    api.post("/api/sms/inbound").send(Map.of("from", PHONE, "body", "PKXM " + code(v))).expect(401);
    api.post("/api/sms/inbound").header("X-Gateway-Token", "sai").send(Map.of("from", PHONE, "body", "PKXM " + code(v))).expect(401);

    String body = "{\"event\":\"sms:received\",\"payload\":{\"messageId\":\"m1\",\"message\":\"PKXM " + code(v)
        + "\",\"phoneNumber\":\"+84912345678\",\"simNumber\":1,\"receivedAt\":\"2026-11-08T10:00:00.000+07:00\"}}";
    String ts = String.valueOf(Instant.now().getEpochSecond());
    java.util.function.BiFunction<String, String, Api.Req> send = (sig, t) -> api.post("/api/sms/inbound").header("X-Signature", sig).header("X-Timestamp", t)
        .raw("application/json", body.getBytes(StandardCharsets.UTF_8));
    send.apply(PhoneVerify.hmacHex("khoa-sai", body + ts), ts).expect(401);
    String old = String.valueOf(Long.parseLong(ts) - 600);
    send.apply(PhoneVerify.hmacHex(KEY, body + old), old).expect(401);
    assertThat(send.apply(PhoneVerify.hmacHex(KEY, body + ts), ts).expect(200).body().get("result").asText()).isEqualTo("VERIFIED");
    assertThat(status(v)).isEqualTo("VERIFIED");
  }

  @Test
  @DisplayName("admin xem cấu hình cổng và tin đã nhận; không ai khác xem được")
  void admin() {
    String admin = fx.createUser(Role.ADMIN).token();
    JsonNode v = start();
    fromIphone(PHONE, "PKXM " + code(v)).expect(200);
    api.get("/api/sms/inbound").auth(fx.createUser(Role.RECEPTIONIST).token()).expect(403);
    JsonNode first = api.get("/api/sms/inbound").auth(admin).expect(200).body().get(0);
    assertThat(first.get("source").asText()).isEqualTo("IOS_SHORTCUT");
    assertThat(first.get("result").asText()).isEqualTo("VERIFIED");
    assertThat(first.get("phone").asText()).isEqualTo(PHONE);
    JsonNode config = api.get("/api/sms/config").auth(admin).expect(200).body();
    assertThat(config.toString()).isEqualTo("{\"smsTo\":\"0988000999\",\"iphoneShortcut\":true,\"androidGateway\":true,\"prefix\":\"PKXM\"}");
    // Không còn chế độ giả lập
    api.post("/api/sms/simulate").auth(admin).send(Map.of("from", PHONE, "body", code(v))).expect(404);
  }

  @Test
  @DisplayName("đăng ký bằng số của hồ sơ có sẵn: đã chứng minh giữ số thì thấy ngay lịch sử khám")
  void existingProfile() {
    String reception = fx.createUser(Role.RECEPTIONIST).token();
    var p = api.post("/api/patients").auth(reception).send(Map.of("fullName", "Trần Văn B", "phone", PHONE, "dateOfBirth", "1990-01-01", "gender", "MALE"))
        .expect(201).body();
    JsonNode v = start();
    fromIphone(PHONE, "PKXM " + code(v)).expect(200);
    var res = api.post("/api/auth/register").send(withTicket(v)).expect(201).body();
    var link = api.get("/api/patients/me/link").auth(res.get("accessToken").asText()).expect(200).body();
    assertThat(link.toString()).isEqualTo("{\"verified\":true,\"hiddenVisits\":0}");
    assertThat(patients.findById(p.get("id").asText()).orElseThrow().getVerifiedAt()).isNotNull();
  }

  @Test
  @DisplayName("quên mật khẩu: xác minh số bằng tin nhắn rồi đặt mật khẩu mới, các máy khác bị đăng xuất")
  void resetPassword() {
    System.setProperty("REQUIRE_PHONE_VERIFICATION", "false");
    var old = api.post("/api/auth/register").send(register()).expect(201).body();
    System.setProperty("REQUIRE_PHONE_VERIFICATION", "true");

    // Số chưa có tài khoản / số của nhân viên / đăng ký trùng
    api.post("/api/auth/phone-verifications").send(Map.of("phone", "0999999999", "purpose", "RESET_PASSWORD")).expect(404);
    var staff = fx.createUser(Role.DOCTOR);
    api.post("/api/auth/phone-verifications").send(Map.of("phone", staff.user().getPhone(), "purpose", "RESET_PASSWORD")).expect(400);
    api.post("/api/auth/phone-verifications").send(Map.of("phone", PHONE, "purpose", "REGISTER")).expect(409);

    JsonNode v = start(PHONE, "RESET_PASSWORD");
    String id = v.get("id").asText();
    String ticket = v.get("ticket").asText();
    // Chưa nhắn tin thì không đặt được
    api.post("/api/auth/reset-password").send(Map.of("verificationId", id, "ticket", ticket, "newPassword", "muadong2026")).expect(400);
    fromIphone(PHONE, "PKXM " + code(v)).expect(200);
    assertThat(api.post("/api/auth/reset-password").send(Map.of("verificationId", id, "ticket", "sai", "newPassword", "muadong2026")).expect(400).body()
        .get("message").asText()).contains("xác minh lại");
    assertThat(api.post("/api/auth/reset-password").send(Map.of("verificationId", id, "ticket", ticket, "newPassword", "abc")).expect(400).body()
        .get("message").asText()).isEqualTo("Mật khẩu tối thiểu 8 ký tự");
    var done = api.post("/api/auth/reset-password").send(Map.of("verificationId", id, "ticket", ticket, "newPassword", "muadong2026")).expect(200).body();
    assertThat(done.at("/user/phone").asText()).isEqualTo(PHONE);
    api.get("/api/auth/me").auth(old.get("accessToken").asText()).expect(401);
    api.post("/api/auth/login").send(Map.of("phone", PHONE, "password", "muadong2026")).expect(200);
    // Mỗi phiên chỉ dùng một lần
    api.post("/api/auth/reset-password").send(Map.of("verificationId", id, "ticket", ticket, "newPassword", "muaha2026x")).expect(400);
  }

  @Test
  @DisplayName("quên mật khẩu: máy cũ thôi nhận thông báo đẩy; tài khoản bị khóa thì không đổi được mật khẩu")
  void resetLocked() {
    System.setProperty("REQUIRE_PHONE_VERIFICATION", "false");
    var old = api.post("/api/auth/register").send(register()).expect(201).body();
    System.setProperty("REQUIRE_PHONE_VERIFICATION", "true");
    api.post("/api/notifications/push-token").auth(old.get("accessToken").asText()).send(Map.of("token", "ExpoPushToken[may-cu]", "platform", "ios")).expect(200);

    JsonNode v = start(PHONE, "RESET_PASSWORD");
    Map<String, Object> reset = Map.of("verificationId", v.get("id").asText(), "ticket", v.get("ticket").asText(), "newPassword", "muadong2026");
    fromIphone(PHONE, "PKXM " + code(v)).expect(200);
    String userId = old.at("/user/id").asText();
    User before = users.findById(userId).orElseThrow();
    String hashBefore = before.getPasswordHash();
    before.setActive(false);
    users.saveAndFlush(before);
    assertThat(api.post("/api/auth/reset-password").send(reset).expect(401).body().get("message").asText()).contains("bị khóa");
    assertThat(users.findById(userId).orElseThrow().getPasswordHash()).isEqualTo(hashBefore);

    // Được mở khóa: dùng lại phiên xác minh vừa rồi, không phải nhắn tin lại
    User u = users.findById(userId).orElseThrow();
    u.setActive(true);
    users.saveAndFlush(u);
    api.post("/api/auth/reset-password").send(reset).expect(200);
    assertThat(pushTokens.findAll().stream().filter(t -> t.getUserId().equals(userId)).count()).isZero();
  }

  @Test
  @DisplayName("giới hạn số phiên theo số điện thoại; phiên hết hạn")
  void limits() {
    for (int i = 0; i < PhoneVerifyService.MAX_PER_PHONE_HOUR; i++) start();
    api.post("/api/auth/phone-verifications").send(Map.of("phone", PHONE, "purpose", "REGISTER")).expect(429);

    verifications.deleteAllInBatch();
    JsonNode v = start("0912000111", "REGISTER");
    PhoneVerification pv = verifications.findById(v.get("id").asText()).orElseThrow();
    pv.setExpiresAt(Instant.now().minusSeconds(1));
    verifications.saveAndFlush(pv);
    assertThat(status(v)).isEqualTo("EXPIRED");
    assertThat(svc.handleInbound("IOS_SHORTCUT", "0912000111", "PKXM " + code(v), Instant.now()).get("result")).isEqualTo("NO_MATCH");
  }

  @Test
  @DisplayName("chuẩn hóa số người gửi và tìm mã trong tin")
  void utils() {
    assertThat(PhoneVerify.normalizePhone("+84 912 345 678")).isEqualTo("0912345678");
    assertThat(PhoneVerify.normalizePhone("84912345678")).isEqualTo("0912345678");
    assertThat(PhoneVerify.normalizePhone("0912-345-678")).isEqualTo("0912345678");
    assertThat(PhoneVerify.normalizePhone("Mẹ")).isNull();
    assertThat(PhoneVerify.normalizePhone("a@b.com")).isNull();
    assertThat(PhoneVerify.codeIn("PKXM 482913")).isEqualTo("482913");
    assertThat(PhoneVerify.codeIn("pkxm482913")).isEqualTo("482913");
    assertThat(PhoneVerify.codeIn("Mã của tôi là 004213 nhé")).isEqualTo("004213");
    assertThat(PhoneVerify.codeIn("PKXM 12345")).isNull();
    assertThat(PhoneVerify.codeIn("1234567")).isNull();
  }
}
