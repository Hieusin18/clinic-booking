package com.clinic.service;

import com.clinic.entity.Patient;
import com.clinic.exception.ApiException;
import com.clinic.repository.PatientRepository;
import com.clinic.security.AuthUser;
import java.time.Instant;
import org.springframework.stereotype.Component;

/** Tìm hồ sơ bệnh nhân gắn với tài khoản đang đăng nhập. */
@Component
public class PatientScope {
  private final PatientRepository patients;

  public PatientScope(PatientRepository patients) {
    this.patients = patients;
  }

  /**
   * Hồ sơ và mốc ẩn dữ liệu cũ (null = thấy hết): chỉ lấy bản ghi tạo từ lúc tài khoản gắn vào hồ sơ khi hồ sơ
   * chưa xác minh.
   */
  public record Scope(String patientId, Instant lockedBefore) {}

  public String patientIdOf(AuthUser user) {
    return patients.findByUserId(user.sub()).map(Patient::getId)
        .orElseThrow(() -> ApiException.forbidden("Tài khoản chưa có hồ sơ bệnh nhân"));
  }

  public Scope scopeOf(AuthUser user) {
    Patient p = patients.findByUserId(user.sub()).orElseThrow(() -> ApiException.forbidden("Tài khoản chưa có hồ sơ bệnh nhân"));
    return new Scope(p.getId(), p.getHistoryLockedBefore());
  }
}
