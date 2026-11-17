package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.entity.enums.ResultMode;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.LabResultsService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "lab")
@RestController
public class LabResultsController {
  private final LabResultsService lab;
  private final BodyReader body;

  public LabResultsController(LabResultsService lab, BodyReader body) {
    this.lab = lab;
    this.body = body;
  }

  private static String trim(String s) {
    return s == null ? null : s.trim();
  }

  public record LabOrderRequest(@Size(min = 2, message = "Nhập tên chỉ định") @Size(max = 200) String name, @Size(max = 500) String note) {}

  /** @param resultText mô tả và kết luận kết quả; done: true = trả kết quả, false = mở lại để sửa */
  public record LabResultRequest(@Size(max = 4000) String resultText, Boolean done) {}

  /** Lượt khám đang chờ kết quả cận lâm sàng của bác sĩ đang đăng nhập */
  @Roles(Role.DOCTOR)
  @GetMapping("/lab/awaiting-visits")
  public List<Map<String, Object>> awaiting(@CurrentUser AuthUser user) {
    return lab.awaiting(user);
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/visits/{id}/lab-orders")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> addOrder(@CurrentUser AuthUser user, @PathVariable String id, @RequestBody(required = false) JsonNode raw) {
    LabOrderRequest r = body.read(raw, LabOrderRequest.class).value();
    LabOrderRequest dto = new LabOrderRequest(trim(r.name()), trim(r.note()));
    if (dto.name() == null) throw new ValidationException(List.of("Nhập tên chỉ định", "name must be a string"));
    body.validate(dto);
    return lab.addOrder(user, id, dto.name(), dto.note());
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/visits/{id}/send-for-tests")
  public Map<String, Object> sendForTests(@CurrentUser AuthUser user, @PathVariable String id, @RequestBody(required = false) JsonNode raw) {
    String mode = raw == null ? null : raw.path("mode").asText(null);
    if (!"RETURN".equals(mode) && !"ONLINE".equals(mode)) throw new ValidationException("Chọn cách nhận kết quả");
    return lab.sendForTests(user, id, ResultMode.valueOf(mode), Instant.now());
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/visits/{id}/results-ready")
  public Map<String, Object> resultsReady(@CurrentUser AuthUser user, @PathVariable String id) {
    return lab.resultsReady(user, id, Instant.now());
  }

  @Roles(Role.DOCTOR)
  @PatchMapping("/lab-orders/{id}")
  public Map<String, Object> saveResult(@CurrentUser AuthUser user, @PathVariable String id, @RequestBody(required = false) JsonNode raw) {
    BodyReader.Patch<LabResultRequest> p = body.read(raw, LabResultRequest.class);
    return lab.saveResult(user, id, p.has("resultText"), trim(p.value().resultText()), p.value().done());
  }

  @Roles(Role.DOCTOR)
  @DeleteMapping("/lab-orders/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void removeOrder(@CurrentUser AuthUser user, @PathVariable String id) {
    lab.removeOrder(user, id);
  }

  /** Tải một tệp kết quả (trường "file", JPG/PNG/PDF, tối đa 10 MB) */
  @Roles(Role.DOCTOR)
  @PostMapping("/lab-orders/{id}/files")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> addFile(@CurrentUser AuthUser user, @PathVariable String id, @RequestParam(value = "file", required = false) MultipartFile file)
      throws IOException {
    return lab.addFile(user, id, file == null ? null : file.getBytes(), file == null ? null : file.getOriginalFilename());
  }

  @Roles(Role.DOCTOR)
  @DeleteMapping("/lab-files/{id}")
  public Map<String, Object> removeFile(@CurrentUser AuthUser user, @PathVariable String id) {
    return lab.removeFile(user, id);
  }

  /** Mở tệp kết quả bằng đường dẫn có chữ ký (lấy từ chi tiết lượt khám), hết hạn sau 1 giờ */
  @Public
  @GetMapping("/lab-files/{id}")
  public ResponseEntity<byte[]> file(@PathVariable String id, @RequestParam(required = false) String exp, @RequestParam(required = false) String sig) {
    if (exp == null || sig == null) throw new ValidationException(List.of("exp must be a string", "sig must be a string"));
    LabResultsService.FileData f = lab.file(id, exp, sig);
    return ResponseEntity.ok()
        .header("Content-Type", f.mimeType())
        .header("Content-Disposition", "inline; filename*=UTF-8''" + URLEncoder.encode(f.fileName(), StandardCharsets.UTF_8).replace("+", "%20"))
        .body(f.data());
  }
}
