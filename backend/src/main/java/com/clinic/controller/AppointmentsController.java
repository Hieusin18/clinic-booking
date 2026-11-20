package com.clinic.controller;

import com.clinic.dto.validation.IsoDate;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.AppointmentsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "appointments")
@RestController
@RequestMapping("/appointments")
public class AppointmentsController {
  private final AppointmentsService service;

  public AppointmentsController(AppointmentsService service) {
    this.service = service;
  }

  /** @param reason lý do khám, triệu chứng ban đầu */
  public record BookRequest(@NotNull String scheduleId, @Size(max = 500) String reason) {}

  @Roles(Role.PATIENT)
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> book(@CurrentUser AuthUser user, @Valid @RequestBody BookRequest dto) {
    return service.book(user, dto.scheduleId(), dto.reason());
  }

  /** when: upcoming = sắp tới (mặc định), past = đã qua hoặc đã hủy */
  @Roles(Role.PATIENT)
  @GetMapping("/mine")
  public List<Map<String, Object>> mine(@CurrentUser AuthUser user, @RequestParam(required = false) String when) {
    if (when != null && !List.of("upcoming", "past").contains(when)) {
      throw new ValidationException("when must be one of the following values: upcoming, past");
    }
    return service.mine(user, when);
  }

  /** Số lần không đến gần đây và hạn khóa đặt lịch online */
  @Roles(Role.PATIENT)
  @GetMapping("/standing")
  public Map<String, Object> standing(@CurrentUser AuthUser user) {
    return service.myStanding(user);
  }

  @Roles(Role.PATIENT)
  @PatchMapping("/{id}/cancel")
  public Map<String, Object> cancel(@CurrentUser AuthUser user, @PathVariable String id) {
    return service.cancel(user, id);
  }

  /** Lịch đặt online đang chờ lễ tân duyệt */
  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping("/pending")
  public Map<String, Object> pending() {
    return service.pending();
  }

  /** Số lịch đang chờ duyệt (hiện trên menu) */
  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping("/pending/count")
  public Map<String, Object> pendingCount() {
    return service.pendingCount();
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @PostMapping("/{id}/confirm")
  public Map<String, Object> confirm(@CurrentUser AuthUser user, @PathVariable String id) {
    return service.confirm(user, id);
  }

  /** @param reason lý do từ chối, bệnh nhân thấy trong thông báo */
  public record RejectRequest(@Size(max = 300) String reason) {}

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @PostMapping("/{id}/reject")
  public Map<String, Object> reject(@CurrentUser AuthUser user, @PathVariable String id, @Valid @RequestBody(required = false) RejectRequest dto) {
    return service.reject(user, id, dto == null ? null : dto.reason());
  }

  /** date: YYYY-MM-DD; bỏ trống = hôm nay */
  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping
  public List<Map<String, Object>> byDay(@RequestParam(required = false) String date) {
    if (date != null && !IsoDate.Validator.valid(date)) throw new ValidationException("date must be a valid ISO 8601 date string");
    return service.byDay(date);
  }
}
