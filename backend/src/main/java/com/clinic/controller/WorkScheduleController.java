package com.clinic.controller;

import com.clinic.dto.shift.ShiftRequest;
import com.clinic.dto.validation.IsoDate;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.WorkScheduleService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Lịch làm việc: admin xem lịch bác sĩ + lễ tân và xếp ca trực lễ tân; lễ tân xem ca của mình. */
@Tag(name = "work-schedule")
@RestController
public class WorkScheduleController {
  private final WorkScheduleService service;

  public WorkScheduleController(WorkScheduleService service) {
    this.service = service;
  }

  static void checkRange(String from, String to) {
    List<String> errors = new ArrayList<>();
    if (from == null || !IsoDate.Validator.valid(from)) errors.add("from must be a valid ISO 8601 date string");
    if (to == null || !IsoDate.Validator.valid(to)) errors.add("to must be a valid ISO 8601 date string");
    if (!errors.isEmpty()) throw new ValidationException(errors);
  }

  /** from/to: YYYY-MM-DD, tối đa 42 ngày */
  @Roles(Role.ADMIN)
  @GetMapping("/work-schedule")
  public Map<String, Object> overview(@RequestParam(required = false) String from, @RequestParam(required = false) String to) {
    checkRange(from, to);
    return service.overview(from, to);
  }

  @Roles(Role.ADMIN)
  @PostMapping("/shifts")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@CurrentUser AuthUser user, @Valid @RequestBody ShiftRequest dto) {
    return service.create(user, dto);
  }

  @Roles(Role.ADMIN)
  @DeleteMapping("/shifts/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(@PathVariable String id) {
    service.remove(id);
  }

  @Roles(Role.RECEPTIONIST)
  @GetMapping("/shifts/mine")
  public List<Map<String, Object>> mine(@CurrentUser AuthUser user, @RequestParam(required = false) String from, @RequestParam(required = false) String to) {
    checkRange(from, to);
    return service.mine(user, from, to);
  }
}
