package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.catalog.ReceptionistPatch;
import com.clinic.dto.catalog.ReceptionistRequest;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.security.Roles;
import com.clinic.service.StaffService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "staff")
@Roles(Role.ADMIN)
@RestController
@RequestMapping("/staff")
public class StaffController {
  private final StaffService service;
  private final BodyReader body;

  public StaffController(StaffService service, BodyReader body) {
    this.service = service;
    this.body = body;
  }

  /** "receptionists" → lễ tân, "nurses" → điều dưỡng; loại khác thì 404 */
  static Role roleOf(String kind) {
    return switch (kind) {
      case "receptionists" -> Role.RECEPTIONIST;
      case "nurses" -> Role.NURSE;
      default -> throw ApiException.notFound("Cannot GET /api/staff/" + kind);
    };
  }

  @GetMapping("/{kind}")
  public Map<String, Object> list(@PathVariable String kind, @Valid PageQuery q) {
    return service.list(roleOf(kind), q);
  }

  @PostMapping("/{kind}")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@PathVariable String kind, @Valid @RequestBody ReceptionistRequest dto) {
    return service.create(roleOf(kind), dto);
  }

  @PatchMapping("/{kind}/{id}")
  public Map<String, Object> update(@PathVariable String kind, @PathVariable String id, @RequestBody(required = false) JsonNode dto) {
    return service.update(roleOf(kind), id, body.read(dto, ReceptionistPatch.class));
  }
}
