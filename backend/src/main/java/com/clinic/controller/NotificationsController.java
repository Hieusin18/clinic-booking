package com.clinic.controller;

import com.clinic.entity.enums.NotificationType;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AllowPendingPassword;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.NotificationsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "notifications")
@RestController
@RequestMapping("/notifications")
public class NotificationsController {
  private final NotificationsService service;

  public NotificationsController(NotificationsService service) {
    this.service = service;
  }

  /** @param types chỉ đánh dấu các loại này (vd. mở phiếu số thì đánh dấu tin gọi số, không đụng tin "có kết quả") */
  public record MarkReadRequest(@Size(max = 100) List<String> ids, String visitId, Boolean all, List<NotificationType> types) {}

  public record PushTokenRequest(
      @NotNull @Size(max = 200) @Pattern(regexp = "^Expo(nent)?PushToken\\[[^\\]]+\\]$", message = "Token thông báo không hợp lệ") String token,
      @NotNull @Pattern(regexp = "^(ios|android)$", message = "platform must be one of the following values: ios, android") String platform) {}

  public record RemovePushTokenRequest(@NotNull @Size(max = 200) String token) {}

  @Roles(Role.PATIENT)
  @GetMapping("/mine")
  public Map<String, Object> mine(@CurrentUser AuthUser user, @RequestParam(required = false) String limit) {
    Integer n = null;
    if (limit != null) {
      try {
        n = Integer.parseInt(limit);
      } catch (NumberFormatException e) {
        throw new ValidationException("limit must be an integer number");
      }
      if (n < 1 || n > 100) throw new ValidationException("limit must not be less than 1 and not greater than 100");
    }
    return service.mine(user, n);
  }

  @Roles(Role.PATIENT)
  @PostMapping("/read")
  public Map<String, Object> read(@CurrentUser AuthUser user, @Valid @RequestBody MarkReadRequest dto) {
    return service.markRead(user, dto.ids(), dto.visitId(), dto.all(), dto.types());
  }

  @Roles(Role.PATIENT)
  @PostMapping("/push-token")
  public Map<String, Object> register(@CurrentUser AuthUser user, @Valid @RequestBody PushTokenRequest dto) {
    return service.registerToken(user, dto.token(), dto.platform());
  }

  @AllowPendingPassword
  @PostMapping("/push-token/remove")
  public Map<String, Object> remove(@CurrentUser AuthUser user, @Valid @RequestBody RemovePushTokenRequest dto) {
    return service.removeToken(user, dto.token());
  }
}
