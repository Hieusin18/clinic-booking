package com.clinic.security;

import com.clinic.exception.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Kiểm tra đăng nhập cho mọi API (chạy trước Controller): cần JWT hợp lệ, trừ API gắn {@link Public}.
 * API gắn {@link Roles} thì vai trò của tài khoản phải nằm trong danh sách.
 * Tài khoản đang dùng mật khẩu tạm chỉ gọi được các API gắn {@link AllowPendingPassword}.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {
  public static final String USER_ATTR = "authUser";

  private final SessionVerifier sessions;

  public AuthInterceptor(SessionVerifier sessions) {
    this.sessions = sessions;
  }

  @Override
  public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
    if (!(handler instanceof HandlerMethod method)) return true;
    if (has(method, Public.class)) return true;

    String header = req.getHeader("Authorization");
    String[] parts = header == null ? new String[0] : header.split(" ");
    if (parts.length < 2 || !"Bearer".equals(parts[0]) || parts[1].isEmpty()) throw ApiException.unauthorized("Bạn cần đăng nhập");

    SessionVerifier.Session s = sessions.verify(parts[1]);
    req.setAttribute(USER_ATTR, s.user());

    if (s.mustChangePassword() && !has(method, AllowPendingPassword.class)) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("statusCode", 403);
      body.put("code", "MUST_CHANGE_PASSWORD");
      body.put("message", "Bạn đang dùng mật khẩu tạm, hãy đổi mật khẩu trước khi tiếp tục");
      throw new ApiException(HttpStatus.FORBIDDEN, body);
    }

    Roles roles = method.getMethodAnnotation(Roles.class);
    if (roles == null) roles = method.getBeanType().getAnnotation(Roles.class);
    if (roles != null && Arrays.stream(roles.value()).noneMatch(r -> r == s.user().role())) {
      throw ApiException.forbidden("Bạn không có quyền thực hiện thao tác này");
    }
    return true;
  }

  private static boolean has(HandlerMethod m, Class<? extends java.lang.annotation.Annotation> a) {
    return m.hasMethodAnnotation(a) || m.getBeanType().isAnnotationPresent(a);
  }
}
