package com.clinic.controller;

import com.clinic.dto.auth.ChangePasswordRequest;
import com.clinic.dto.auth.LoginRequest;
import com.clinic.dto.auth.RegisterRequest;
import com.clinic.dto.auth.ResetPasswordRequest;
import com.clinic.security.AllowPendingPassword;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Public;
import com.clinic.service.AuthService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "auth")
@RestController
@RequestMapping("/auth")
public class AuthController {
  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  /** Bệnh nhân tự đăng ký tài khoản trên app */
  @Public
  @PostMapping("/register")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> register(@Valid @RequestBody RegisterRequest dto) {
    return auth.register(dto);
  }

  /** Đăng nhập cho cả 4 vai trò, trả về JWT */
  @Public
  @PostMapping("/login")
  public Map<String, Object> login(@Valid @RequestBody LoginRequest dto, HttpServletRequest req) {
    return auth.login(dto, req.getRemoteAddr(), Instant.now());
  }

  /** Thông tin tài khoản đang đăng nhập, kèm hồ sơ bệnh nhân hoặc bác sĩ */
  @AllowPendingPassword
  @GetMapping("/me")
  public Map<String, Object> me(@CurrentUser AuthUser user) {
    return auth.me(user);
  }

  /** Quên mật khẩu: đặt mật khẩu mới sau khi nhắn tin xác minh số điện thoại */
  @Public
  @PostMapping("/reset-password")
  public Map<String, Object> resetPassword(@Valid @RequestBody ResetPasswordRequest dto) {
    return auth.resetPassword(dto);
  }

  /** Đổi mật khẩu; trả về token mới (các máy khác bị đăng xuất) */
  @AllowPendingPassword
  @PostMapping("/change-password")
  public Map<String, Object> changePassword(@CurrentUser AuthUser user, @Valid @RequestBody ChangePasswordRequest dto) {
    return auth.changePassword(user, dto);
  }

  /** Đăng xuất khỏi mọi thiết bị */
  @AllowPendingPassword
  @PostMapping("/logout-all")
  public Map<String, Object> logoutAll(@CurrentUser AuthUser user) {
    return auth.logoutAll(user);
  }
}
