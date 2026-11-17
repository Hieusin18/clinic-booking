package com.clinic.view;

import com.clinic.entity.Patient;
import java.util.List;
import java.util.Map;

/** Các dạng hồ sơ bệnh nhân trả cho client. */
public final class PatientViews {
  /** Thông tin cá nhân lễ tân đã nhập, bị che khi hồ sơ chưa xác minh */
  public static final List<String> PRIVATE_FIELDS = List.of(
      "nationalId", "address", "insuranceNo", "insuranceExpiry", "allergies", "occupation", "ethnicity",
      "relativeName", "relativePhone");

  private PatientViews() {}

  /** Thông tin hành chính, không bao gồm bệnh án (lễ tân được xem). */
  public static Map<String, Object> admin(Patient p) {
    return Json.obj("id", p.getId(), "fullName", p.getFullName(), "phone", p.getPhone(), "dateOfBirth", p.getDateOfBirth(),
        "gender", p.getGender(), "nationalId", p.getNationalId(), "address", p.getAddress(), "insuranceNo", p.getInsuranceNo(),
        "insuranceExpiry", p.getInsuranceExpiry(), "allergies", p.getAllergies(), "occupation", p.getOccupation(),
        "ethnicity", p.getEthnicity(), "relativeName", p.getRelativeName(), "relativePhone", p.getRelativePhone(),
        "createdAt", p.getCreatedAt(), "userId", p.getUserId());
  }

  /**
   * Hồ sơ trả cho chính bệnh nhân: bỏ mã liên kết và các cột nội bộ; hồ sơ có sẵn chưa xác minh thì che thông tin
   * cá nhân lễ tân đã nhập. Không có mã liên kết ở đây là điều kiện để kẻ chiếm số không tự xác minh được.
   *
   * @param base dữ liệu hồ sơ (đủ cột hoặc dạng admin) để lọc
   */
  public static Map<String, Object> self(Patient p, Map<String, Object> base) {
    base.remove("historyLockedBefore");
    base.remove("linkCode");
    base.remove("verifyFailures");
    base.remove("verifyLockedUntil");
    if (p.getHistoryLockedBefore() == null) {
      base.put("verified", true);
      return base;
    }
    for (String f : PRIVATE_FIELDS) base.put(f, null);
    base.put("verified", false);
    return base;
  }

  /** Hồ sơ của chính bệnh nhân theo dạng admin (GET /patients/me). */
  public static Map<String, Object> self(Patient p) {
    return self(p, admin(p));
  }
}
