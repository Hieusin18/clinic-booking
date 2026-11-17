package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.catalog.MedicinePatch;
import com.clinic.dto.catalog.MedicineRequest;
import com.clinic.entity.enums.Role;
import com.clinic.security.Roles;
import com.clinic.service.MedicinesService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "medicines")
@RestController
@RequestMapping("/medicines")
public class MedicinesController {
  private final MedicinesService service;
  private final BodyReader body;

  public MedicinesController(MedicinesService service, BodyReader body) {
    this.service = service;
    this.body = body;
  }

  /** Tìm thuốc theo tên hoặc hoạt chất (bác sĩ dùng khi kê đơn); admin truyền includeInactive=true để xem cả thuốc đã ngừng dùng */
  @Roles({Role.DOCTOR, Role.ADMIN})
  @GetMapping
  public Map<String, Object> list(@Valid PageQuery q, @RequestParam(required = false) String includeInactive) {
    return service.list(q, "true".equals(includeInactive));
  }

  @Roles(Role.ADMIN)
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody MedicineRequest dto) {
    return service.create(dto);
  }

  @Roles(Role.ADMIN)
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable String id, @RequestBody(required = false) JsonNode dto) {
    return service.update(id, body.read(dto, MedicinePatch.class));
  }
}
