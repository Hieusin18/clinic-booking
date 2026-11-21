package com.clinic.service;

import com.clinic.dto.auth.ChangePasswordRequest;
import com.clinic.dto.auth.LoginRequest;
import com.clinic.dto.auth.RegisterRequest;
import com.clinic.dto.auth.ResetPasswordRequest;
import com.clinic.entity.Doctor;
import com.clinic.entity.Patient;
import com.clinic.entity.PhoneVerification;
import com.clinic.entity.User;
import com.clinic.entity.enums.PhoneVerifyPurpose;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.PatientRepository;
import com.clinic.repository.PhoneVerificationRepository;
import com.clinic.repository.UserRepository;
import com.clinic.security.AuthUser;
import com.clinic.security.JwtService;
import com.clinic.security.Passwords;
import com.clinic.view.Json;
import com.clinic.view.PatientViews;
import com.clinic.view.Rows;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Đăng ký, đăng nhập (chống dò mật khẩu), đổi / đặt lại mật khẩu, đăng xuất mọi thiết bị. */
@Service
public class AuthService {
  /** Nhập sai bấy nhiêu lần liên tiếp thì tạm khóa tài khoản */
  public static final int MAX_FAILED_LOGINS = 5;
  public static final int LOCK_MINUTES = 15;
  /** Mỗi địa chỉ IP được nhập sai tối đa bấy nhiêu lần trong LOCK_MINUTES (chống thử mật khẩu trên nhiều tài khoản) */
  public static final int MAX_FAILED_PER_IP = 30;
  private static final String BAD_LOGIN = "Sai số điện thoại hoặc mật khẩu";
  private static final String ACCOUNT_LOCKED = "Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên";

  private final UserRepository users;
  private final PatientRepository patients;
  private final DoctorRepository doctors;
  private final PhoneVerificationRepository verifications;
  private final PhoneVerifyService phoneVerify;
  private final SessionsService sessions;
  private final JwtService jwt;

  /** Lần nhập sai gần đây theo địa chỉ IP (trong bộ nhớ; khởi động lại máy chủ thì xóa) */
  private final Map<String, List<Long>> failedByIp = new ConcurrentHashMap<>();

  public AuthService(UserRepository users, PatientRepository patients, DoctorRepository doctors, PhoneVerificationRepository verifications,
      PhoneVerifyService phoneVerify, SessionsService sessions, JwtService jwt) {
    this.users = users;
    this.patients = patients;
    this.doctors = doctors;
    this.verifications = verifications;
    this.phoneVerify = phoneVerify;
    this.sessions = sessions;
    this.jwt = jwt;
  }

  /**
   * Bệnh nhân tự đăng ký. Nếu lễ tân đã tạo hồ sơ với cùng SĐT (chưa có tài khoản) thì gắn tài khoản mới vào hồ sơ đó
   * để bệnh nhân thấy lịch sử khám cũ.
   */
  @Transactional
  public Map<String, Object> register(RegisterRequest dto) {
    String weak = Passwords.problem(dto.password(), dto.phone());
    if (weak != null) throw ApiException.badRequest(weak);
    if (users.findByPhone(dto.phone()).isPresent()) throw ApiException.conflict("Số điện thoại đã được đăng ký");
    String relativeName = dto.relativeName().strip();
    if (relativeName.length() < 2) throw ApiException.badRequest("Nhập họ tên người thân");
    if (dto.relativePhone().equals(dto.phone())) throw ApiException.badRequest("Số điện thoại người thân phải khác số của bạn");
    // CCCD là duy nhất: đã gắn với hồ sơ của người khác (khác số điện thoại) thì không đăng ký được, ra quầy để kiểm tra
    patients.findByNationalId(dto.nationalId()).filter(p -> !dto.phone().equals(p.getPhone())).ifPresent(p -> {
      throw ApiException.conflict("Số CCCD này đã có trong hồ sơ khác của phòng khám. Vui lòng kiểm tra lại hoặc liên hệ quầy lễ tân.");
    });
    boolean hasVerification = dto.verificationId() != null && !dto.verificationId().isEmpty() && dto.ticket() != null && !dto.ticket().isEmpty();
    Instant now = Instant.now();

    // Số điện thoại phải được chứng minh bằng tin nhắn gửi từ chính SIM đó (PhoneVerifyService)
    boolean phoneProven = false;
    if (phoneVerify.required() || hasVerification) {
      phoneVerify.consume(dto.verificationId(), dto.ticket(), PhoneVerifyPurpose.REGISTER, dto.phone(), now);
      phoneProven = true;
    }
    User created = new User();
    created.setFullName(dto.fullName());
    created.setPhone(dto.phone());
    created.setEmail(dto.email());
    created.setPasswordHash(Passwords.hash(dto.password()));
    created.setRole(Role.PATIENT);
    users.saveAndFlush(created);

    Patient existing = patients.findByPhone(dto.phone()).orElse(null);
    if (existing != null) {
      if (existing.getUserId() != null) throw ApiException.conflict("Số điện thoại đã được đăng ký");
      // Hồ sơ có sẵn (lễ tân tạo khi khám vãng lai). Đã chứng minh giữ số điện thoại thì thấy ngay lịch sử khám;
      // chưa thì ẩn bệnh án cũ cho tới khi xác minh bằng mã liên kết / tại quầy (AccountLinkService)
      existing.setUserId(created.getId());
      existing.setVerifyFailures(0);
      // Hồ sơ lễ tân đã ghi thì giữ nguyên; chỉ bổ sung ô còn trống
      if (existing.getNationalId() == null) existing.setNationalId(dto.nationalId());
      if (existing.getRelativeName() == null) existing.setRelativeName(relativeName);
      if (existing.getRelativePhone() == null) existing.setRelativePhone(dto.relativePhone());
      if (phoneProven) {
        existing.setHistoryLockedBefore(null);
        existing.setVerifiedAt(now);
      } else {
        existing.setHistoryLockedBefore(now);
      }
    } else {
      Patient p = new Patient();
      p.setUserId(created.getId());
      p.setFullName(dto.fullName());
      p.setPhone(dto.phone());
      p.setDateOfBirth(LocalDate.parse(dto.dateOfBirth().substring(0, 10)));
      p.setGender(dto.gender());
      p.setNationalId(dto.nationalId());
      p.setRelativeName(relativeName);
      p.setRelativePhone(dto.relativePhone());
      patients.saveAndFlush(p);
    }
    return issueToken(created);
  }

  /** Xóa bộ đếm nhập sai theo IP (dùng trong test). */
  public void clearFailedLogins() {
    failedByIp.clear();
  }

  private boolean ipBlocked(String ip, long now) {
    List<Long> recent = new ArrayList<>(failedByIp.getOrDefault(ip, List.of()).stream().filter(t -> now - t < LOCK_MINUTES * 60_000L).toList());
    failedByIp.put(ip, recent);
    return recent.size() >= MAX_FAILED_PER_IP;
  }

  private static ApiException tooMany(long minutes) {
    return ApiException.tooMany("Nhập sai quá nhiều lần. Vui lòng thử lại sau " + minutes + " phút.");
  }

  /**
   * Đăng nhập. Chống dò mật khẩu: sai 5 lần liên tiếp thì tài khoản tạm khóa 15 phút (kể cả nhập đúng trong lúc khóa);
   * một địa chỉ IP sai quá 30 lần trong 15 phút thì bị chặn.
   */
  @Transactional(noRollbackFor = ApiException.class)
  public Map<String, Object> login(LoginRequest dto, String ip, Instant now) {
    if (ipBlocked(ip, now.toEpochMilli())) throw tooMany(LOCK_MINUTES);

    User user = users.findByPhone(dto.phone()).orElse(null);
    if (user != null && user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) {
      throw tooMany((long) Math.ceil((user.getLockedUntil().toEpochMilli() - now.toEpochMilli()) / 60_000.0));
    }
    if (user == null || !Passwords.verify(dto.password(), user.getPasswordHash())) {
      failedByIp.computeIfAbsent(ip, k -> new ArrayList<>()).add(now.toEpochMilli());
      if (user != null) {
        int failed = user.getFailedLogins() + 1;
        boolean lock = failed >= MAX_FAILED_LOGINS;
        if (lock) {
          user.setFailedLogins(0);
          user.setLockedUntil(now.plusSeconds(LOCK_MINUTES * 60L));
        } else {
          user.setFailedLogins(failed);
        }
        users.saveAndFlush(user);
        if (lock) {
          // Bệnh nhân tự lấy lại mật khẩu bằng tin nhắn; nhân viên nhờ admin cấp mật khẩu tạm
          String forgot = user.getRole() == Role.PATIENT ? "quên mật khẩu hãy chọn \"Quên mật khẩu\"" : "quên mật khẩu hãy liên hệ quản trị viên";
          throw ApiException.tooMany("Nhập sai mật khẩu " + MAX_FAILED_LOGINS + " lần. Tài khoản tạm khóa " + LOCK_MINUTES + " phút; " + forgot + ".");
        }
      }
      throw ApiException.unauthorized(BAD_LOGIN);
    }
    if (!user.isActive()) throw ApiException.unauthorized(ACCOUNT_LOCKED);
    user.setFailedLogins(0);
    user.setLockedUntil(null);
    user.setLastLoginAt(now);
    users.saveAndFlush(user);
    return issueToken(user);
  }

  /**
   * Đổi mật khẩu (mọi vai trò, kể cả khi đang dùng mật khẩu tạm). Các máy khác đang đăng nhập bị đăng xuất;
   * máy đang dùng nhận token mới để tiếp tục.
   */
  @Transactional
  public Map<String, Object> changePassword(AuthUser auth, ChangePasswordRequest dto) {
    User user = users.findById(auth.sub()).orElseThrow(() -> ApiException.notFound("Không tìm thấy tài khoản"));
    if (!Passwords.verify(dto.currentPassword(), user.getPasswordHash())) throw ApiException.badRequest("Mật khẩu hiện tại không đúng");
    if (dto.newPassword().equals(dto.currentPassword())) throw ApiException.badRequest("Mật khẩu mới phải khác mật khẩu hiện tại");
    String weak = Passwords.problem(dto.newPassword(), user.getPhone());
    if (weak != null) throw ApiException.badRequest(weak);
    user.setPasswordHash(Passwords.hash(dto.newPassword()));
    user.setMustChangePassword(false);
    user.setPasswordChangedAt(Instant.now());
    user.setTokenVersion(user.getTokenVersion() + 1);
    users.saveAndFlush(user);
    sessions.revoke(user.getId(), dto.pushToken());
    return issueToken(user);
  }

  /**
   * Quên mật khẩu (bệnh nhân): đã nhắn tin xác minh số điện thoại thì đặt mật khẩu mới, mọi máy đang đăng nhập bị
   * đăng xuất, tạm khóa do nhập sai được gỡ; trả token để đăng nhập luôn.
   */
  @Transactional
  public Map<String, Object> resetPassword(ResetPasswordRequest dto) {
    PhoneVerification v = verifications.findById(dto.verificationId()).orElse(null);
    User user = v == null ? null : users.findByPhone(v.getPhone()).orElse(null);
    if (v == null || user == null || user.getRole() != Role.PATIENT) {
      throw ApiException.badRequest("Phiên xác minh không hợp lệ, vui lòng xác minh lại");
    }
    // Tài khoản bị khóa thì không đổi mật khẩu (và giữ phiên xác minh để không phải nhắn tin lại sau khi được mở khóa)
    if (!user.isActive()) throw ApiException.unauthorized(ACCOUNT_LOCKED);
    String weak = Passwords.problem(dto.newPassword(), user.getPhone());
    if (weak != null) throw ApiException.badRequest(weak);
    Instant now = Instant.now();
    phoneVerify.consume(dto.verificationId(), dto.ticket(), PhoneVerifyPurpose.RESET_PASSWORD, user.getPhone(), now);
    user.setPasswordHash(Passwords.hash(dto.newPassword()));
    user.setMustChangePassword(false);
    user.setPasswordChangedAt(now);
    user.setFailedLogins(0);
    user.setLockedUntil(null);
    user.setTokenVersion(user.getTokenVersion() + 1);
    users.saveAndFlush(user);
    sessions.revoke(user.getId());
    return issueToken(user);
  }

  /** Đăng xuất khỏi mọi thiết bị (kể cả máy đang dùng). */
  @Transactional
  public Map<String, Object> logoutAll(AuthUser auth) {
    users.bumpTokenVersion(auth.sub());
    sessions.revoke(auth.sub());
    return Json.obj("ok", true);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> me(AuthUser auth) {
    User user = users.findById(auth.sub()).orElseThrow(() -> ApiException.notFound("Không tìm thấy tài khoản"));
    Map<String, Object> out = Rows.publicUser(user);
    // Không trả mã liên kết; hồ sơ có sẵn chưa xác minh thì che thông tin cá nhân (như GET /patients/me)
    Patient p = patients.findByUserId(user.getId()).orElse(null);
    out.put("patient", p == null ? null : PatientViews.self(p, Rows.patient(p)));
    Doctor d = doctors.findByUserId(user.getId()).orElse(null);
    if (d == null) {
      out.put("doctor", null);
    } else {
      Map<String, Object> doctor = Rows.doctor(d);
      doctor.put("specialty", Rows.specialty(d.getSpecialty()));
      out.put("doctor", doctor);
    }
    return out;
  }

  private Map<String, Object> issueToken(User user) {
    String token = jwt.sign(new AuthUser(user.getId(), user.getRole(), user.getTokenVersion()));
    return Json.obj("accessToken", token, "user", Rows.publicUser(user));
  }
}
