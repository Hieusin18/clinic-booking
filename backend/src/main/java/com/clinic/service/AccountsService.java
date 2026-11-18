package com.clinic.service;

import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.UserRepository;
import com.clinic.security.AuthUser;
import com.clinic.security.Passwords;
import com.clinic.view.Json;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin đặt lại mật khẩu cho nhân viên quên mật khẩu: hệ thống tạo mật khẩu tạm (chỉ hiện một lần cho admin đưa tận
 * tay), người dùng phải đổi ở lần đăng nhập đầu; mọi máy đang đăng nhập bằng tài khoản đó bị đăng xuất.
 * Admin quên mật khẩu thì chạy lệnh trên máy chủ: {@code java -jar app.jar reset-password <số điện thoại>}.
 */
@Service
public class AccountsService {
  private final UserRepository users;
  private final SessionsService sessions;

  public AccountsService(UserRepository users, SessionsService sessions) {
    this.users = users;
    this.sessions = sessions;
  }

  /** Đặt mật khẩu tạm cho một tài khoản (dùng chung cho API của admin và lệnh trên máy chủ). */
  @Transactional
  public Map<String, Object> issueTemporaryPassword(String userId) {
    String password = Passwords.temporary();
    User u = users.findById(userId).orElseThrow(() -> ApiException.notFound("Không tìm thấy tài khoản"));
    u.setPasswordHash(Passwords.hash(password));
    u.setMustChangePassword(true);
    u.setTokenVersion(u.getTokenVersion() + 1);
    u.setFailedLogins(0);
    u.setLockedUntil(null);
    users.saveAndFlush(u);
    return Json.obj("user", Json.obj("id", u.getId(), "fullName", u.getFullName(), "phone", u.getPhone(), "role", u.getRole()),
        "temporaryPassword", password);
  }

  @Transactional
  public Map<String, Object> resetPassword(AuthUser admin, String userId) {
    User target = users.findById(userId).orElseThrow(() -> ApiException.notFound("Không tìm thấy tài khoản"));
    if (userId.equals(admin.sub())) throw ApiException.badRequest("Hãy dùng chức năng Đổi mật khẩu cho tài khoản của bạn");
    if (target.getRole() != Role.DOCTOR && target.getRole() != Role.RECEPTIONIST) {
      throw ApiException.badRequest("Chỉ đặt lại được mật khẩu của bác sĩ và lễ tân");
    }
    Map<String, Object> result = issueTemporaryPassword(userId);
    sessions.revoke(userId);
    return result;
  }
}
