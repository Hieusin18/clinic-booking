package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.doctor.CreateDoctorRequest;
import com.clinic.dto.doctor.DoctorPatch;
import com.clinic.entity.enums.Role;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.DoctorsService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "doctors")
@RestController
@RequestMapping("/doctors")
public class DoctorsController {
  private final DoctorsService service;
  private final BodyReader body;

  public DoctorsController(DoctorsService service, BodyReader body) {
    this.service = service;
    this.body = body;
  }

  private static byte[] bytes(MultipartFile file) throws IOException {
    return file == null ? null : file.getBytes();
  }

  /** Danh sách bác sĩ đang hoạt động, lọc theo chuyên khoa (bệnh nhân dùng) */
  @Public
  @GetMapping
  public Map<String, Object> list(@Valid PageQuery q, @RequestParam(required = false) String specialtyId) {
    return service.list(q, specialtyId, false);
  }

  /** Danh sách đầy đủ kể cả bác sĩ đã khóa, kèm tài khoản (trang admin) */
  @Roles(Role.ADMIN)
  @GetMapping("/all")
  public Map<String, Object> listAll(@Valid PageQuery q, @RequestParam(required = false) String specialtyId) {
    return service.list(q, specialtyId, true);
  }

  /** Bác sĩ xem hồ sơ của mình */
  @Roles(Role.DOCTOR)
  @GetMapping("/me")
  public Map<String, Object> mine(@CurrentUser AuthUser user) {
    return service.mine(user);
  }

  /** Bác sĩ tự sửa giới thiệu, kinh nghiệm, thế mạnh, quá trình đào tạo và công tác */
  @Roles(Role.DOCTOR)
  @PatchMapping("/me")
  public Map<String, Object> updateMine(@CurrentUser AuthUser user, @RequestBody(required = false) JsonNode dto) {
    return service.updateMine(user, body.read(dto, DoctorPatch.class));
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/me/avatar")
  public Map<String, Object> uploadMyAvatar(@CurrentUser AuthUser user, @RequestParam(value = "file", required = false) MultipartFile file) throws IOException {
    return service.setAvatar(service.doctorIdOf(user), bytes(file));
  }

  @Roles(Role.DOCTOR)
  @DeleteMapping("/me/avatar")
  public Map<String, Object> removeMyAvatar(@CurrentUser AuthUser user) {
    return service.removeAvatar(service.doctorIdOf(user));
  }

  /** Hồ sơ bác sĩ cho bệnh nhân xem trước khi đặt lịch */
  @Public
  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable String id) {
    return service.profile(id);
  }

  /** Ảnh đại diện; URL kèm ?v=&lt;avatarVersion&gt; nên được cache lâu */
  @Public
  @GetMapping("/{id}/avatar")
  public ResponseEntity<byte[]> avatar(@PathVariable String id) {
    DoctorsService.Avatar a = service.avatar(id);
    return ResponseEntity.ok()
        .header("Content-Type", a.mimeType())
        .header("Cache-Control", "public, max-age=86400")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'")
        .body(a.data());
  }

  /** Hồ sơ kèm tài khoản để admin sửa (kể cả bác sĩ đã khóa) */
  @Roles(Role.ADMIN)
  @GetMapping("/{id}/full")
  public Map<String, Object> full(@PathVariable String id) {
    return service.full(id);
  }

  @Roles(Role.ADMIN)
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody CreateDoctorRequest dto) {
    return service.create(dto);
  }

  @Roles(Role.ADMIN)
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable String id, @RequestBody(required = false) JsonNode dto) {
    return service.update(id, body.read(dto, DoctorPatch.class));
  }

  @Roles(Role.ADMIN)
  @PostMapping("/{id}/avatar")
  public Map<String, Object> uploadAvatar(@PathVariable String id, @RequestParam(value = "file", required = false) MultipartFile file) throws IOException {
    return service.setAvatar(id, bytes(file));
  }

  @Roles(Role.ADMIN)
  @DeleteMapping("/{id}/avatar")
  public Map<String, Object> removeAvatar(@PathVariable String id) {
    return service.removeAvatar(id);
  }
}
