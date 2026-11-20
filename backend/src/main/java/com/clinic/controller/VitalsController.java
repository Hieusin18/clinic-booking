package com.clinic.controller;

import com.clinic.dto.vitals.VitalsRequest;
import com.clinic.entity.enums.Role;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.VitalsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Sinh hiệu do điều dưỡng đo trước khi bệnh nhân vào khám. */
@Tag(name = "vitals")
@RestController
public class VitalsController {
  private final VitalsService service;

  public VitalsController(VitalsService service) {
    this.service = service;
  }

  /** Bệnh nhân hôm nay kèm sinh hiệu (doctorId: lọc theo bác sĩ) */
  @Roles({Role.NURSE, Role.ADMIN})
  @GetMapping("/vitals/today")
  public List<Map<String, Object>> today(@RequestParam(required = false) String doctorId) {
    return service.today(doctorId);
  }

  /** Ghi hoặc sửa sinh hiệu (điều dưỡng; bác sĩ cũng ghi được nếu tự đo) */
  @Roles({Role.NURSE, Role.DOCTOR})
  @PutMapping("/visits/{id}/vitals")
  public Map<String, Object> save(@CurrentUser AuthUser user, @PathVariable String id, @Valid @RequestBody VitalsRequest dto) {
    return service.save(user, id, dto);
  }
}
