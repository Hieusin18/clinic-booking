package com.clinic.service;

import com.clinic.entity.Patient;
import com.clinic.entity.User;
import com.clinic.exception.ApiException;
import com.clinic.repository.PatientRepository;
import com.clinic.repository.PushTokenRepository;
import com.clinic.repository.UserRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.view.Json;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Liên kết tài khoản app với hồ sơ bệnh nhân có sẵn (lễ tân đã tạo khi khám vãng lai).
 *
 * <p>Vấn đề: hồ sơ có sẵn đã có bệnh án. Nếu đăng ký bằng số điện thoại là xem được ngay thì ai biết số điện thoại
 * cũng đọc được bệnh án người khác. Nên khi tài khoản mới gắn vào hồ sơ có sẵn:
 * <ul>
 *   <li>tài khoản dùng được ngay (đặt lịch, lấy số, khám mới), nhưng lượt khám / lịch hẹn có từ trước bị ẩn và thông tin
 *       cá nhân lễ tân đã nhập (CCCD, BHYT, địa chỉ, dị ứng…) bị che, không sửa được;</li>
 *   <li>chứng minh là chính chủ bằng thứ chỉ chính chủ có: mã liên kết in trên phiếu khám / bệnh án, hoặc lễ tân đối
 *       chiếu CCCD tại quầy;</li>
 *   <li>kẻ chiếm số trước không xác minh được; chính chủ ra quầy thì lễ tân gỡ tài khoản đó để chính chủ đăng ký.</li>
 * </ul>
 */
@Service
public class AccountLinkService {
  public static final int MAX_VERIFY_FAILURES = 5;
  public static final int VERIFY_LOCK_MINUTES = 60;
  /** Bỏ các ký tự dễ nhầm (0/O, 1/I/L) vì bệnh nhân gõ lại từ giấy */
  private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  public static final int LINK_CODE_LENGTH = 6;
  private static final SecureRandom RANDOM = new SecureRandom();

  private final PatientRepository patients;
  private final UserRepository users;
  private final VisitRepository visits;
  private final PushTokenRepository pushTokens;
  private final SessionsService sessions;

  public AccountLinkService(PatientRepository patients, UserRepository users, VisitRepository visits, PushTokenRepository pushTokens,
      SessionsService sessions) {
    this.patients = patients;
    this.users = users;
    this.visits = visits;
    this.pushTokens = pushTokens;
    this.sessions = sessions;
  }

  public static String newLinkCode() {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < LINK_CODE_LENGTH; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
    return sb.toString();
  }

  /** Chuẩn hóa mã bệnh nhân gõ: bỏ khoảng trắng / gạch, viết hoa */
  public static String normalizeCode(String code) {
    return code.replaceAll("[\\s-]", "").toUpperCase();
  }

  /** Mã liên kết của hồ sơ (tạo nếu chưa có). Chỉ trả cho nhân viên và bản in của bác sĩ, không trả qua API của bệnh nhân. */
  @Transactional
  public String ensureLinkCode(String patientId) {
    Patient p = patients.findById(patientId).orElseThrow(() -> ApiException.notFound("Không tìm thấy bệnh nhân"));
    if (p.getLinkCode() != null) return p.getLinkCode();
    for (int attempt = 0; ; attempt++) {
      String code = newLinkCode();
      try {
        // Chỉ ghi nếu vẫn chưa có (hai yêu cầu cùng lúc không tạo hai mã)
        if (patients.setLinkCodeIfEmpty(patientId, code) == 1) return code;
        return patients.findById(patientId).orElseThrow().getLinkCode();
      } catch (DataIntegrityViolationException e) {
        // Trùng mã với hồ sơ khác (rất hiếm): thử mã khác
        if (attempt >= 5) throw e;
      }
    }
  }

  /** Bệnh nhân: tình trạng liên kết (số lượt khám đang bị ẩn) */
  @Transactional(readOnly = true)
  public Map<String, Object> myStatus(AuthUser user) {
    Patient p = patients.findByUserId(user.sub()).orElseThrow(() -> ApiException.forbidden("Tài khoản chưa có hồ sơ bệnh nhân"));
    Instant locked = p.getHistoryLockedBefore();
    long hidden = locked == null ? 0 : visits.countByPatientIdAndCreatedAtBefore(p.getId(), locked);
    return Json.obj("verified", locked == null, "hiddenVisits", hidden);
  }

  /** Bệnh nhân nhập mã liên kết in trên phiếu khám / bệnh án. Sai 5 lần thì khóa 60 phút. */
  @Transactional(noRollbackFor = ApiException.class)
  public Map<String, Object> verifyWithCode(AuthUser user, String rawCode, Instant now) {
    Patient p = patients.findByUserId(user.sub()).orElseThrow(() -> ApiException.forbidden("Tài khoản chưa có hồ sơ bệnh nhân"));
    if (p.getHistoryLockedBefore() == null) return Json.obj("verified", true, "hiddenVisits", 0);
    if (p.getVerifyLockedUntil() != null && p.getVerifyLockedUntil().isAfter(now)) {
      long minutes = (long) Math.ceil((p.getVerifyLockedUntil().toEpochMilli() - now.toEpochMilli()) / 60_000.0);
      throw ApiException.tooMany("Nhập sai mã quá nhiều lần. Thử lại sau " + minutes + " phút hoặc nhờ lễ tân xác minh.");
    }
    if (p.getLinkCode() == null || !normalizeCode(rawCode).equals(p.getLinkCode())) {
      int failures = p.getVerifyFailures() + 1;
      boolean lock = failures >= MAX_VERIFY_FAILURES;
      if (lock) {
        p.setVerifyFailures(0);
        p.setVerifyLockedUntil(now.plusSeconds(VERIFY_LOCK_MINUTES * 60L));
      } else {
        p.setVerifyFailures(failures);
      }
      patients.saveAndFlush(p);
      throw ApiException.badRequest(lock
          ? "Mã không đúng. Bạn đã nhập sai " + MAX_VERIFY_FAILURES + " lần, thử lại sau " + VERIFY_LOCK_MINUTES + " phút."
          : "Mã liên kết không đúng");
    }
    patients.markVerified(p.getId(), now);
    return Json.obj("verified", true, "hiddenVisits", 0);
  }

  /** Lễ tân: tình trạng tài khoản app của hồ sơ, kèm mã liên kết để đưa / in cho bệnh nhân */
  @Transactional
  public Map<String, Object> accountOf(String patientId) {
    Patient p = patients.findById(patientId).orElseThrow(() -> ApiException.notFound("Không tìm thấy bệnh nhân"));
    String linkCode = ensureLinkCode(patientId);
    p = patients.findById(patientId).orElseThrow();
    User u = p.getUserId() == null ? null : users.findById(p.getUserId()).orElse(null);
    String status = u == null ? "NONE" : p.getHistoryLockedBefore() != null ? "UNVERIFIED" : "VERIFIED";
    return Json.obj("status", status, "linkCode", linkCode, "registeredAt", u == null ? null : u.getCreatedAt(), "verifiedAt", p.getVerifiedAt());
  }

  /** Lễ tân xác minh sau khi đối chiếu CCCD tại quầy */
  @Transactional
  public Map<String, Object> verifyAtCounter(String patientId) {
    Patient p = patients.findById(patientId).orElseThrow(() -> ApiException.notFound("Không tìm thấy bệnh nhân"));
    if (p.getUserId() == null) throw ApiException.conflict("Bệnh nhân chưa có tài khoản app");
    patients.markVerified(patientId, Instant.now());
    return accountOf(patientId);
  }

  /**
   * Lễ tân gỡ tài khoản lạ (người khác đăng ký trước bằng số của bệnh nhân): khóa tài khoản đó, trả số điện thoại về
   * trống để chính chủ đăng ký. Chỉ gỡ được tài khoản chưa xác minh.
   */
  @Transactional
  public Map<String, Object> detach(String patientId) {
    Patient p = patients.findById(patientId).orElseThrow(() -> ApiException.notFound("Không tìm thấy bệnh nhân"));
    if (p.getUserId() == null) throw ApiException.conflict("Bệnh nhân chưa có tài khoản app");
    if (p.getHistoryLockedBefore() == null) throw ApiException.conflict("Tài khoản đã được xác minh là chính chủ, không gỡ được");
    String userId = p.getUserId();
    p.setUserId(null);
    p.setHistoryLockedBefore(null);
    p.setVerifyFailures(0);
    p.setVerifyLockedUntil(null);
    patients.saveAndFlush(p);
    // Đổi số đăng nhập của tài khoản bị gỡ để số thật trống cho chính chủ; khóa và vô hiệu mọi phiên
    User u = users.findById(userId).orElseThrow();
    u.setActive(false);
    u.setPhone("gỡ-" + System.currentTimeMillis() + "-" + userId.substring(0, 8));
    u.setTokenVersion(u.getTokenVersion() + 1);
    users.saveAndFlush(u);
    pushTokens.deleteAllOfUser(userId);
    sessions.revoke(userId);
    return accountOf(patientId);
  }
}
