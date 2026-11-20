package com.clinic.controller;

import com.clinic.dto.banner.BannerRequest;
import com.clinic.entity.enums.Role;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.BannersService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Banner trên app bệnh nhân: app đọc danh sách đang hiện; admin tạo, sửa, xếp thứ tự, tải ảnh. */
@Tag(name = "banners")
@RestController
public class BannersController {
  private final BannersService service;

  public BannersController(BannersService service) {
    this.service = service;
  }

  @Public
  @GetMapping("/banners")
  public List<Map<String, Object>> showing() {
    return service.showing();
  }

  /** Ảnh banner; URL kèm ?v=&lt;imageVersion&gt; nên được cache lâu */
  @Public
  @GetMapping("/banners/{id}/image")
  public ResponseEntity<byte[]> image(@PathVariable String id) {
    BannersService.Image i = service.image(id);
    return ResponseEntity.ok()
        .header("Content-Type", i.mimeType())
        .header("Cache-Control", "public, max-age=86400")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'")
        .body(i.data());
  }

  @Roles(Role.ADMIN)
  @GetMapping("/admin/banners")
  public List<Map<String, Object>> all() {
    return service.all();
  }

  @Roles(Role.ADMIN)
  @PostMapping("/admin/banners")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody BannerRequest dto) {
    return service.create(dto);
  }

  @Roles(Role.ADMIN)
  @PutMapping("/admin/banners/{id}")
  public Map<String, Object> update(@PathVariable String id, @Valid @RequestBody BannerRequest dto) {
    return service.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @DeleteMapping("/admin/banners/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(@PathVariable String id) {
    service.remove(id);
  }

  @Roles(Role.ADMIN)
  @PostMapping("/admin/banners/{id}/image")
  public Map<String, Object> uploadImage(@PathVariable String id, @RequestParam(value = "file", required = false) MultipartFile file) throws IOException {
    return service.setImage(id, file == null ? null : file.getBytes());
  }
}
