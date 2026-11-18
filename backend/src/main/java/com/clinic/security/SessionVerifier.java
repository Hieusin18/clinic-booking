package com.clinic.security;

import com.clinic.entity.User;
import com.clinic.exception.ApiException;
import com.clinic.repository.UserRepository;
import org.springframework.stereotype.Component;

/**
 * Kiểm tra token còn dùng được không: chữ ký và hạn của JWT, rồi tới tài khoản trong CSDL
 * (còn hoạt động, chưa đổi mật khẩu / đăng xuất mọi thiết bị sau khi cấp token).
 * Nhờ vậy khóa tài khoản hay đặt lại mật khẩu có hiệu lực ngay, không phải chờ token hết hạn.
 */
@Component
public class SessionVerifier {
  public static final String SESSION_EXPIRED = "Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại";

  /** Kết quả kiểm tra: người dùng và cờ đang dùng mật khẩu tạm. */
  public record Session(AuthUser user, boolean mustChangePassword) {}

  private final JwtService jwt;
  private final UserRepository users;

  public SessionVerifier(JwtService jwt, UserRepository users) {
    this.jwt = jwt;
    this.users = users;
  }

  public Session verify(String token) {
    AuthUser payload;
    try {
      payload = jwt.verify(token);
    } catch (IllegalArgumentException e) {
      throw ApiException.unauthorized("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
    }
    User account = users.findById(payload.sub()).orElse(null);
    if (account == null || payload.ver() != account.getTokenVersion()) throw ApiException.unauthorized(SESSION_EXPIRED);
    if (!account.isActive()) throw ApiException.unauthorized("Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên");
    return new Session(new AuthUser(payload.sub(), account.getRole(), account.getTokenVersion()), account.isMustChangePassword());
  }
}
