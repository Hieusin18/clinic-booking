package com.clinic.controller;

import com.clinic.dto.Ids;
import com.clinic.dto.auth.StartVerificationRequest;
import com.clinic.exception.ValidationException;
import com.clinic.security.Public;
import com.clinic.service.PhoneVerifyService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "auth")
@RestController
@RequestMapping("/auth/phone-verifications")
public class PhoneVerifyController {
  private final PhoneVerifyService service;

  public PhoneVerifyController(PhoneVerifyService service) {
    this.service = service;
  }

  /** Bắt đầu xác minh số: trả mã để người dùng nhắn tới số của phòng khám */
  @Public
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> start(@Valid @RequestBody StartVerificationRequest dto, HttpServletRequest req) {
    return service.start(dto, req.getRemoteAddr(), Instant.now());
  }

  /** App hỏi trạng thái (mỗi 2 giây) cho tới khi VERIFIED / EXPIRED */
  @Public
  @GetMapping("/{id}")
  public Map<String, Object> status(@PathVariable String id, @RequestParam(required = false) String ticket) {
    Ids.uuid(id);
    if (ticket == null) throw new ValidationException(java.util.List.of("ticket must be a string", "ticket must be shorter than or equal to 100 characters"));
    if (ticket.length() > 100) throw new ValidationException("ticket must be shorter than or equal to 100 characters");
    return service.status(id, ticket, Instant.now());
  }
}
