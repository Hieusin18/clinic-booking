package com.clinic.controller;

import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.PhoneVerifyService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "sms")
@RestController
@RequestMapping("/sms")
public class SmsController {
  private final PhoneVerifyService service;

  public SmsController(PhoneVerifyService service) {
    this.service = service;
  }

  /** Cổng SMS chuyển tin nhắn đến (iPhone Phím tắt / Android SMS Gateway). Luôn trả 200 khi đã xác thực. */
  @Public
  @PostMapping("/inbound")
  public Map<String, Object> inbound(
      @RequestBody(required = false) byte[] raw,
      @RequestHeader(value = "x-signature", required = false) String signature,
      @RequestHeader(value = "x-timestamp", required = false) String timestamp,
      @RequestHeader(value = "x-gateway-token", required = false) String token) {
    Instant now = Instant.now();
    PhoneVerifyService.GatewayMessage msg = service.authenticate(raw, signature, timestamp, token, now);
    return service.handleInbound(msg.source(), msg.from(), msg.body(), now);
  }

  @Roles(Role.ADMIN)
  @GetMapping("/inbound")
  public List<Map<String, Object>> recent(@RequestParam(required = false) String limit) {
    Integer n = null;
    if (limit != null) {
      try {
        n = Integer.parseInt(limit);
      } catch (NumberFormatException e) {
        throw new ValidationException("limit must be an integer number");
      }
      if (n < 1 || n > 200) throw new ValidationException("limit must not be less than 1 and not greater than 200");
    }
    return service.recentInbound(n);
  }

  @Roles(Role.ADMIN)
  @GetMapping("/config")
  public Map<String, Object> config() {
    return service.configView();
  }
}
