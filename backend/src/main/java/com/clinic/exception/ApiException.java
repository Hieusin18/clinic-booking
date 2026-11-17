package com.clinic.exception;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Lỗi nghiệp vụ trả về cho client. Thân JSON giống bản NestJS cũ:
 * {@code {"statusCode": 409, "message": "...", "error": "Conflict"}} hoặc một object tùy chỉnh (kèm "code").
 */
public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final transient Map<String, Object> body;

  public ApiException(HttpStatus status, String message) {
    super(message);
    this.status = status;
    this.body = new LinkedHashMap<>();
    body.put("statusCode", status.value());
    body.put("message", message);
    body.put("error", status.getReasonPhrase());
  }

  /** Thân lỗi tùy chỉnh (vd. kèm mã lỗi "code" để client xử lý riêng). */
  public ApiException(HttpStatus status, Map<String, Object> body) {
    super(String.valueOf(body.get("message")));
    this.status = status;
    this.body = new LinkedHashMap<>(body);
  }

  public HttpStatus getStatus() {
    return status;
  }

  public Map<String, Object> getBody() {
    return body;
  }

  public static ApiException badRequest(String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, message);
  }

  public static ApiException unauthorized(String message) {
    return new ApiException(HttpStatus.UNAUTHORIZED, message);
  }

  public static ApiException forbidden(String message) {
    return new ApiException(HttpStatus.FORBIDDEN, message);
  }

  public static ApiException notFound(String message) {
    return new ApiException(HttpStatus.NOT_FOUND, message);
  }

  public static ApiException conflict(String message) {
    return new ApiException(HttpStatus.CONFLICT, message);
  }

  public static ApiException tooMany(String message) {
    return new ApiException(HttpStatus.TOO_MANY_REQUESTS, message);
  }

  /** 409 kèm mã lỗi và dữ liệu thêm (vd. CHECKIN_TOO_EARLY kèm giờ mở check-in). */
  public static ApiException conflictWithCode(String code, String message, Map<String, Object> extra) {
    Map<String, Object> b = new LinkedHashMap<>();
    b.put("statusCode", 409);
    b.put("code", code);
    b.put("message", message);
    if (extra != null) b.putAll(extra);
    return new ApiException(HttpStatus.CONFLICT, b);
  }
}
