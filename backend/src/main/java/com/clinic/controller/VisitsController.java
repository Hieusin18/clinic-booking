package com.clinic.controller;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.visit.PrescriptionRequest;
import com.clinic.dto.visit.RecordRequest;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.VisitsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "visits")
@RestController
public class VisitsController {
  private final VisitsService service;
  private final BodyReader body;

  public VisitsController(VisitsService service, BodyReader body) {
    this.service = service;
    this.body = body;
  }

  /** Lịch sử khám của bệnh nhân đang đăng nhập, kèm bệnh án và đơn thuốc */
  @Roles(Role.PATIENT)
  @GetMapping("/visits/mine")
  public List<Map<String, Object>> myHistory(@CurrentUser AuthUser user) {
    return service.myHistory(user);
  }

  /** Bác sĩ tra cứu bệnh án các lượt mình đã khám xong (mọi ngày): ?q=tên, SĐT, chẩn đoán hoặc mã ICD&from=&to= */
  @Roles(Role.DOCTOR)
  @GetMapping("/visits/examined")
  public Map<String, Object> examined(@CurrentUser AuthUser user, @Valid PageQuery q, @RequestParam(required = false) String from,
      @RequestParam(required = false) String to) {
    SchedulesController.checkDate("from", from, false);
    SchedulesController.checkDate("to", to, false);
    return service.examined(user, q, from, to);
  }

  /** Bác sĩ xem các lần khám trước của một bệnh nhân */
  @Roles(Role.DOCTOR)
  @GetMapping("/visits/history")
  public List<Map<String, Object>> patientHistory(@CurrentUser AuthUser user, @RequestParam(required = false) String patientId) {
    if (patientId == null) throw new ValidationException("patientId must be a string");
    return service.patientHistory(user, patientId);
  }

  @Roles({Role.DOCTOR, Role.PATIENT})
  @GetMapping("/visits/{id}")
  public Map<String, Object> detail(@CurrentUser AuthUser user, @PathVariable String id) {
    return service.detail(user, id);
  }

  /** Xem trước bệnh án và đơn thuốc (HTML, không có JavaScript) */
  @Roles({Role.DOCTOR, Role.PATIENT})
  @GetMapping("/visits/{id}/record.html")
  public ResponseEntity<String> previewHtml(@CurrentUser AuthUser user, @PathVariable String id) {
    return ResponseEntity.ok()
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors *")
        .header("Cache-Control", "no-store")
        .body(service.preview(user, id));
  }

  private ResponseEntity<byte[]> download(VisitsService.Download d) {
    return ResponseEntity.ok()
        .header("Content-Type", d.contentType())
        .header("Content-Disposition", "attachment; filename=\"" + d.fileName() + "\"")
        .body(d.data());
  }

  /** Tải bệnh án và đơn thuốc dạng PDF */
  @Roles({Role.DOCTOR, Role.PATIENT})
  @GetMapping("/visits/{id}/record.pdf")
  public ResponseEntity<byte[]> exportPdf(@CurrentUser AuthUser user, @PathVariable String id) throws IOException {
    return download(service.export(user, id, "pdf"));
  }

  /** Tải bệnh án và đơn thuốc dạng Word (.docx) */
  @Roles({Role.DOCTOR, Role.PATIENT})
  @GetMapping("/visits/{id}/record.docx")
  public ResponseEntity<byte[]> exportDocx(@CurrentUser AuthUser user, @PathVariable String id) throws IOException {
    return download(service.export(user, id, "docx"));
  }

  /** Ghi hoặc sửa bệnh án (chỉ bác sĩ phụ trách) */
  @Roles(Role.DOCTOR)
  @PutMapping("/visits/{id}/record")
  public Map<String, Object> saveRecord(@CurrentUser AuthUser user, @PathVariable String id, @RequestBody RecordRequest dto) {
    RecordRequest normalized = dto.normalized();
    body.validate(normalized);
    return service.saveRecord(user, id, normalized);
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/visits/{id}/complete")
  public Map<String, Object> complete(@CurrentUser AuthUser user, @PathVariable String id) {
    return service.complete(user, id);
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/visits/{id}/prescriptions")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> createPrescription(@CurrentUser AuthUser user, @PathVariable String id, @Valid @RequestBody PrescriptionRequest dto) {
    return service.createPrescription(user, id, dto);
  }

  @Roles(Role.DOCTOR)
  @PatchMapping("/prescriptions/{id}")
  public Map<String, Object> updatePrescription(@CurrentUser AuthUser user, @PathVariable String id, @Valid @RequestBody PrescriptionRequest dto) {
    return service.updatePrescription(user, id, dto);
  }

  @Roles(Role.DOCTOR)
  @PostMapping("/prescriptions/{id}/finalize")
  public Map<String, Object> finalizePrescription(@CurrentUser AuthUser user, @PathVariable String id) {
    return service.finalizePrescription(user, id);
  }

  @Roles(Role.DOCTOR)
  @DeleteMapping("/prescriptions/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void removeDraft(@CurrentUser AuthUser user, @PathVariable String id) {
    service.removeDraft(user, id);
  }
}
