package com.clinic.controller;

import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.FollowUpService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Bác sĩ đặt / hủy lịch tái khám cho bệnh nhân của mình. */
@Tag(name = "follow-up")
@RestController
public class FollowUpController {
  private final FollowUpService service;

  public FollowUpController(FollowUpService service) {
    this.service = service;
  }

  public record BookRequest(String scheduleId) {}

  @Roles(Role.DOCTOR)
  @PostMapping("/visits/{id}/follow-up")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> book(@CurrentUser AuthUser user, @PathVariable String id, @RequestBody(required = false) BookRequest body) {
    if (body == null || body.scheduleId() == null || body.scheduleId().isBlank()) throw new ValidationException("scheduleId must be a string");
    return service.book(user, id, body.scheduleId());
  }

  @Roles(Role.DOCTOR)
  @DeleteMapping("/visits/{id}/follow-up")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancel(@CurrentUser AuthUser user, @PathVariable String id) {
    service.cancel(user, id);
  }
}
