package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.catalog.SpecialtyPatch;
import com.clinic.dto.catalog.SpecialtyRequest;
import com.clinic.entity.enums.Role;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.SpecialtiesService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "specialties")
@RestController
@RequestMapping("/specialties")
public class SpecialtiesController {
  private final SpecialtiesService service;
  private final BodyReader body;

  public SpecialtiesController(SpecialtiesService service, BodyReader body) {
    this.service = service;
    this.body = body;
  }

  @Public
  @GetMapping
  public Map<String, Object> list(@Valid PageQuery q) {
    return service.list(q);
  }

  @Roles(Role.ADMIN)
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody SpecialtyRequest dto) {
    return service.create(dto);
  }

  @Roles(Role.ADMIN)
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable String id, @RequestBody(required = false) JsonNode dto) {
    return service.update(id, body.read(dto, SpecialtyPatch.class));
  }

  @Roles(Role.ADMIN)
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(@PathVariable String id) {
    service.remove(id);
  }
}
