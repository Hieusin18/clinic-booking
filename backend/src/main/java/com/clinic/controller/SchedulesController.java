package com.clinic.controller;

import com.clinic.dto.schedule.CreateSlotsRequest;
import com.clinic.dto.validation.IsoDate;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.SchedulesService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Instant;
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

@Tag(name = "schedules")
@RestController
public class SchedulesController {
  private final SchedulesService service;

  public SchedulesController(SchedulesService service) {
    this.service = service;
  }

  static void checkDate(String name, String value, boolean required) {
    if (value == null) {
      if (required) throw new ValidationException(name + " must be a valid ISO 8601 date string");
      return;
    }
    if (!IsoDate.Validator.valid(value)) throw new ValidationException(name + " must be a valid ISO 8601 date string");
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/schedules/bulk")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> createSlots(@CurrentUser AuthUser user, @Valid @RequestBody CreateSlotsRequest dto) {
    return service.createSlots(user, dto);
  }

  @Roles(Role.DOCTOR)
  @GetMapping("/schedules/mine")
  public List<Map<String, Object>> mine(@CurrentUser AuthUser user, @RequestParam(required = false) String from, @RequestParam(required = false) String to) {
    List<String> errors = new ArrayList<>();
    if (from == null || !IsoDate.Validator.valid(from)) errors.add("from must be a valid ISO 8601 date string");
    if (to == null || !IsoDate.Validator.valid(to)) errors.add("to must be a valid ISO 8601 date string");
    if (!errors.isEmpty()) throw new ValidationException(errors);
    return service.mine(user, from, to);
  }

  @Roles(Role.DOCTOR)
  @DeleteMapping("/schedules/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(@CurrentUser AuthUser user, @PathVariable String id) {
    service.remove(user, id);
  }

  /** Số giờ trống từng ngày trong 7 ngày tới (trang hồ sơ bác sĩ); days: 1–14 */
  @Public
  @GetMapping("/doctors/{id}/availability")
  public List<Map<String, Object>> availability(@PathVariable String id, @RequestParam(required = false) String days) {
    Integer n = null;
    if (days != null) {
      try {
        n = Integer.parseInt(days);
      } catch (NumberFormatException e) {
        throw new ValidationException("days must be an integer number");
      }
      if (n < 1 || n > 14) throw new ValidationException("days must not be less than 1 and not greater than 14");
    }
    return service.availability(id, n, Instant.now());
  }

  /** date: YYYY-MM-DD (bỏ trống = hôm nay); all=true trả cả khung giờ đã có người đặt để app gạch đi */
  @Public
  @GetMapping("/doctors/{id}/schedules")
  public List<Map<String, Object>> available(@PathVariable String id, @RequestParam(required = false) String date,
      @RequestParam(required = false) String all) {
    checkDate("date", date, false);
    return service.available(id, date, "true".equals(all));
  }
}
