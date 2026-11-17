package com.clinic.exception;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Chuyển mọi lỗi thành JSON cùng định dạng với bản cũ để web và app hiển thị được câu báo lỗi. */
@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  public static ResponseEntity<Map<String, Object>> body(HttpStatus status, Object message) {
    Map<String, Object> b = new LinkedHashMap<>();
    b.put("statusCode", status.value());
    b.put("message", message);
    b.put("error", status.getReasonPhrase());
    return ResponseEntity.status(status).body(b);
  }

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> api(ApiException e) {
    return ResponseEntity.status(e.getStatus()).body(e.getBody());
  }

  /** Dữ liệu gửi lên sai: trả danh sách lỗi (message là mảng, như ValidationPipe của NestJS). */
  @ExceptionHandler(BindException.class)
  public ResponseEntity<Map<String, Object>> invalid(BindException e) {
    List<String> messages = new ArrayList<>();
    for (ObjectError err : e.getAllErrors()) messages.add(describe(err));
    return body(HttpStatus.BAD_REQUEST, messages);
  }

  @ExceptionHandler(ValidationException.class)
  public ResponseEntity<Map<String, Object>> invalid(ValidationException e) {
    return body(HttpStatus.BAD_REQUEST, e.getMessages());
  }

  static String describe(ObjectError err) {
    String msg = err.getDefaultMessage();
    if (err instanceof FieldError fe) {
      if (fe.isBindingFailure()) return fe.getField() + " không hợp lệ";
      try {
        ConstraintViolation<?> v = err.unwrap(ConstraintViolation.class);
        if (v.getMessageTemplate().startsWith("{")) return fe.getField() + " " + msg;
      } catch (IllegalArgumentException ignored) {
        // không phải lỗi từ Bean Validation
      }
    }
    return msg;
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Map<String, Object>> unreadable(HttpMessageNotReadableException e) {
    return body(HttpStatus.BAD_REQUEST, "Dữ liệu gửi lên không đúng định dạng");
  }

  @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
  public ResponseEntity<Map<String, Object>> badParam(Exception e) {
    String name = e instanceof MethodArgumentTypeMismatchException m ? m.getName() : ((MissingServletRequestParameterException) e).getParameterName();
    return body(HttpStatus.BAD_REQUEST, List.of(name + " không hợp lệ"));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<Map<String, Object>> integrity(DataIntegrityViolationException e) {
    Throwable cause = e.getMostSpecificCause();
    if (cause instanceof SQLException sql && "23505".equals(sql.getSQLState())) {
      return body(HttpStatus.CONFLICT, UniqueMessages.message(UniqueMessages.fieldsFromError(sql.getMessage())));
    }
    log.error("Lỗi ràng buộc dữ liệu", e);
    return internal();
  }

  @ExceptionHandler({NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class})
  public ResponseEntity<Map<String, Object>> notFound(Exception e, HttpServletRequest req) {
    return body(HttpStatus.NOT_FOUND, "Cannot " + req.getMethod() + " " + req.getRequestURI());
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ResponseEntity<Map<String, Object>> tooLarge(MaxUploadSizeExceededException e) {
    return body(HttpStatus.PAYLOAD_TOO_LARGE, "Tệp quá lớn");
  }

  @ExceptionHandler({MultipartException.class, HttpMediaTypeNotSupportedException.class})
  public ResponseEntity<Map<String, Object>> badMultipart(Exception e) {
    return body(HttpStatus.BAD_REQUEST, "Dữ liệu gửi lên không đúng định dạng");
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> other(Exception e) {
    log.error("Lỗi không mong đợi", e);
    return internal();
  }

  private static ResponseEntity<Map<String, Object>> internal() {
    Map<String, Object> b = new LinkedHashMap<>();
    b.put("statusCode", 500);
    b.put("message", "Internal server error");
    return ResponseEntity.status(500).body(b);
  }
}
