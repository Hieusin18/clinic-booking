package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.dto.Ids;
import com.clinic.dto.PageQuery;
import com.clinic.dto.patient.PatientPatch;
import com.clinic.dto.patient.PatientRequest;
import com.clinic.entity.enums.Role;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.AccountLinkService;
import com.clinic.service.PatientsService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
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

@Tag(name = "patients")
@RestController
@RequestMapping("/patients")
public class PatientsController {
  private final PatientsService service;
  private final AccountLinkService link;
  private final BodyReader body;

  public PatientsController(PatientsService service, AccountLinkService link, BodyReader body) {
    this.service = service;
    this.link = link;
    this.body = body;
  }

  public record VerifyCodeRequest(@NotNull @Size(min = 4, max = 20) String code) {}

  /** Hồ sơ của chính bệnh nhân đang đăng nhập */
  @Roles(Role.PATIENT)
  @GetMapping("/me")
  public Map<String, Object> mine(@CurrentUser AuthUser user) {
    return service.mine(user);
  }

  @Roles(Role.PATIENT)
  @PatchMapping("/me")
  public Map<String, Object> updateMine(@CurrentUser AuthUser user, @RequestBody(required = false) JsonNode dto) {
    return service.updateMine(user, body.read(dto, PatientPatch.class));
  }

  @Roles(Role.PATIENT)
  @GetMapping("/me/link")
  public Map<String, Object> myLinkStatus(@CurrentUser AuthUser user) {
    return link.myStatus(user);
  }

  @Roles(Role.PATIENT)
  @PostMapping("/me/verify")
  public Map<String, Object> verify(@CurrentUser AuthUser user, @Valid @RequestBody VerifyCodeRequest dto) {
    return link.verifyWithCode(user, dto.code(), Instant.now());
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping
  public Map<String, Object> search(@Valid PageQuery q) {
    return service.search(q);
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR})
  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable String id) {
    return service.get(id);
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody PatientRequest dto) {
    return service.create(dto);
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable String id, @RequestBody(required = false) JsonNode dto) {
    return service.update(id, body.read(dto, PatientPatch.class));
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping("/{id}/account")
  public Map<String, Object> account(@PathVariable String id) {
    return link.accountOf(Ids.uuid(id));
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @PostMapping("/{id}/account/verify")
  public Map<String, Object> verifyAtCounter(@PathVariable String id) {
    return link.verifyAtCounter(Ids.uuid(id));
  }

  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @PostMapping("/{id}/account/detach")
  public Map<String, Object> detach(@PathVariable String id) {
    return link.detach(Ids.uuid(id));
  }
}
