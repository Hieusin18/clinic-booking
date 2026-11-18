package com.clinic.service;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.patient.PatientPatch;
import com.clinic.dto.patient.PatientRequest;
import com.clinic.entity.Patient;
import com.clinic.exception.ApiException;
import com.clinic.repository.PatientRepository;
import com.clinic.security.AuthUser;
import com.clinic.view.PatientViews;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Hồ sơ hành chính bệnh nhân: lễ tân tìm, tạo, sửa; bệnh nhân xem và sửa hồ sơ của mình. */
@Service
public class PatientsService {
  private final PatientRepository patients;

  public PatientsService(PatientRepository patients) {
    this.patients = patients;
  }

  private static LocalDate date(String s) {
    return s == null ? null : LocalDate.parse(s.substring(0, 10));
  }

  /** Lễ tân tìm theo SĐT, CCCD hoặc tên. */
  @Transactional(readOnly = true)
  public Map<String, Object> search(PageQuery q) {
    String term = q.term();
    var pageable = q.pageable(Sort.by(Sort.Direction.DESC, "createdAt"));
    Page<Patient> page = term == null ? patients.findAll(pageable) : patients.search(term, pageable);
    return q.toPage(page.getContent().stream().map(PatientViews::admin).toList(), page.getTotalElements());
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(String id) {
    return PatientViews.admin(find(id));
  }

  private Patient find(String id) {
    return patients.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy hồ sơ bệnh nhân"));
  }

  @Transactional
  public Map<String, Object> create(PatientRequest dto) {
    ensureUnique(dto.phone(), dto.nationalId(), null);
    Patient p = new Patient();
    p.setFullName(dto.fullName());
    p.setPhone(dto.phone());
    p.setDateOfBirth(date(dto.dateOfBirth()));
    p.setGender(dto.gender());
    p.setNationalId(dto.nationalId());
    p.setAddress(dto.address());
    p.setInsuranceNo(dto.insuranceNo());
    p.setInsuranceExpiry(date(dto.insuranceExpiry()));
    p.setAllergies(dto.allergies());
    p.setOccupation(dto.occupation());
    p.setEthnicity(dto.ethnicity());
    p.setRelativeName(dto.relativeName());
    p.setRelativePhone(dto.relativePhone());
    return PatientViews.admin(patients.saveAndFlush(p));
  }

  @Transactional
  public Map<String, Object> update(String id, BodyReader.Patch<PatientPatch> patch) {
    Patient p = find(id);
    PatientPatch dto = patch.value();
    if (dto.phone() != null && p.getUserId() != null && !dto.phone().equals(p.getPhone())) {
      throw ApiException.conflict("Bệnh nhân đã có tài khoản app, không đổi được SĐT");
    }
    ensureUnique(dto.phone(), dto.nationalId(), id);
    if (patch.set("fullName")) p.setFullName(dto.fullName());
    if (patch.set("phone")) p.setPhone(dto.phone());
    if (patch.set("dateOfBirth")) p.setDateOfBirth(date(dto.dateOfBirth()));
    if (patch.set("gender")) p.setGender(dto.gender());
    if (patch.has("nationalId")) p.setNationalId(dto.nationalId());
    if (patch.has("address")) p.setAddress(dto.address());
    if (patch.has("insuranceNo")) p.setInsuranceNo(dto.insuranceNo());
    if (patch.set("insuranceExpiry")) p.setInsuranceExpiry(date(dto.insuranceExpiry()));
    if (patch.has("allergies")) p.setAllergies(dto.allergies());
    if (patch.has("occupation")) p.setOccupation(dto.occupation());
    if (patch.has("ethnicity")) p.setEthnicity(dto.ethnicity());
    if (patch.has("relativeName")) p.setRelativeName(dto.relativeName());
    if (patch.has("relativePhone")) p.setRelativePhone(dto.relativePhone());
    return PatientViews.admin(patients.saveAndFlush(p));
  }

  /**
   * Hồ sơ của bệnh nhân đang đăng nhập. Hồ sơ có sẵn mà tài khoản chưa xác minh (AccountLinkService) thì che các
   * thông tin lễ tân đã nhập.
   */
  @Transactional(readOnly = true)
  public Map<String, Object> mine(AuthUser user) {
    Patient p = patients.findByUserId(user.sub()).orElseThrow(() -> ApiException.notFound("Tài khoản chưa có hồ sơ bệnh nhân"));
    return PatientViews.self(p);
  }

  @Transactional
  public Map<String, Object> updateMine(AuthUser user, BodyReader.Patch<PatientPatch> patch) {
    Patient p = patients.findByUserId(user.sub()).orElseThrow(() -> ApiException.notFound("Tài khoản chưa có hồ sơ bệnh nhân"));
    // Chưa xác minh: không cho sửa hồ sơ có sẵn (tránh người lạ ghi đè dị ứng, BHYT… của chính chủ)
    if (p.getHistoryLockedBefore() != null) {
      throw ApiException.forbidden("Hãy xác minh hồ sơ (nhập mã liên kết hoặc nhờ lễ tân) trước khi sửa thông tin");
    }
    // Không đổi SĐT vì SĐT là tên đăng nhập (bỏ qua nếu có gửi)
    if (patch.raw() instanceof com.fasterxml.jackson.databind.node.ObjectNode o) o.remove("phone");
    PatientPatch v = patch.value();
    PatientPatch noPhone = new PatientPatch(v.fullName(), null, v.dateOfBirth(), v.gender(), v.nationalId(), v.address(), v.insuranceNo(),
        v.insuranceExpiry(), v.allergies(), v.occupation(), v.ethnicity(), v.relativeName(), v.relativePhone());
    return update(p.getId(), new BodyReader.Patch<>(noPhone, patch.raw()));
  }

  private void ensureUnique(String phone, String nationalId, String exceptId) {
    if (phone != null && !phone.isEmpty()) {
      patients.findByPhone(phone).filter(d -> !d.getId().equals(exceptId)).ifPresent(d -> {
        throw ApiException.conflict("SĐT đã có hồ sơ bệnh nhân");
      });
    }
    if (nationalId != null && !nationalId.isEmpty()) {
      patients.findByNationalId(nationalId).filter(d -> !d.getId().equals(exceptId)).ifPresent(d -> {
        throw ApiException.conflict("Số CCCD đã có hồ sơ bệnh nhân");
      });
    }
  }
}
