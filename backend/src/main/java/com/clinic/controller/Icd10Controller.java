package com.clinic.controller;

import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.Roles;
import com.clinic.util.Icd10;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "icd10")
@RestController
@RequestMapping("/icd10")
public class Icd10Controller {
  /** Tìm mã ICD-10 theo mã hoặc tên bệnh (không cần gõ dấu) */
  @Roles(Role.DOCTOR)
  @GetMapping
  public List<Map<String, Object>> search(@RequestParam(required = false) String q) {
    if (q != null && q.length() > 100) throw new ValidationException("q must be shorter than or equal to 100 characters");
    return Icd10.search(q, 20);
  }
}
