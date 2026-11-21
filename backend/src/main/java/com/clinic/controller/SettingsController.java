package com.clinic.controller;

import com.clinic.entity.enums.Role;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.SettingsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Cài đặt quy trình của phòng khám: nhân viên đọc để hiện đúng nút, admin đổi. */
@Tag(name = "settings")
@RestController
public class SettingsController {
  private final SettingsService service;

  public SettingsController(SettingsService service) {
    this.service = service;
  }

  public record SettingsRequest(Boolean vitalsBeforeExam) {}

  @Roles({Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST})
  @GetMapping("/settings")
  public Map<String, Object> get() {
    return service.all();
  }

  @Roles(Role.ADMIN)
  @PutMapping("/settings")
  public Map<String, Object> update(@CurrentUser AuthUser user, @RequestBody(required = false) SettingsRequest body) {
    if (body == null || body.vitalsBeforeExam() == null) throw new com.clinic.exception.ValidationException("vitalsBeforeExam must be a boolean value");
    return service.setVitalsBeforeExam(user, body.vitalsBeforeExam());
  }
}
