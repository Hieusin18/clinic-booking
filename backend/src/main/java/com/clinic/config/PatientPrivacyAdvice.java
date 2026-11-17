package com.clinic.config;

import com.clinic.entity.enums.Role;
import com.clinic.security.AuthInterceptor;
import com.clinic.security.AuthUser;
import com.clinic.view.PatientViews;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Bệnh nhân gọi API thì các object "patient" lồng bên trong (phiếu khám, lịch hẹn…) không kèm thông tin cá nhân
 * lễ tân đã nhập (dị ứng, CCCD, địa chỉ…). Bệnh nhân xem hồ sơ của mình qua GET /patients/me, nơi đã che các mục
 * này khi tài khoản chưa xác minh là chính chủ. Đặt ở một chỗ để API mới thêm sau cũng không lỡ để lộ.
 */
@RestControllerAdvice
public class PatientPrivacyAdvice implements ResponseBodyAdvice<Object> {
  @Override
  public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
    return true;
  }

  @Override
  public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
      Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request, ServerHttpResponse response) {
    if (!(request instanceof ServletServerHttpRequest r)) return body;
    Object user = r.getServletRequest().getAttribute(AuthInterceptor.USER_ATTR);
    if (!(user instanceof AuthUser u) || u.role() != Role.PATIENT) return body;
    return strip(body, 0);
  }

  /** Bỏ các mục riêng tư khỏi mọi object nằm dưới khóa "patient" (trả bản sao, không sửa dữ liệu gốc). */
  @SuppressWarnings("unchecked")
  public static Object strip(Object value, int depth) {
    if (depth > 12) return value;
    if (value instanceof List<?> list) {
      List<Object> out = new ArrayList<>(list.size());
      for (Object v : list) out.add(strip(v, depth + 1));
      return out;
    }
    if (!(value instanceof Map<?, ?> map)) return value;
    Map<String, Object> out = new LinkedHashMap<>();
    for (Map.Entry<?, ?> e : map.entrySet()) {
      String k = String.valueOf(e.getKey());
      Object v = e.getValue();
      if ("patient".equals(k) && v instanceof Map<?, ?>) {
        Map<String, Object> p = (Map<String, Object>) strip(v, depth + 1);
        PatientViews.PRIVATE_FIELDS.forEach(p::remove);
        out.put(k, p);
      } else {
        out.put(k, strip(v, depth + 1));
      }
    }
    return out;
  }
}
