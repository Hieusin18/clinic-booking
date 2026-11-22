package com.clinic.view;

import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.DoctorHistory;
import com.clinic.entity.LabOrder;
import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Medicine;
import com.clinic.entity.Notification;
import com.clinic.entity.Patient;
import com.clinic.entity.Prescription;
import com.clinic.entity.PrescriptionItem;
import com.clinic.entity.Schedule;
import com.clinic.entity.Specialty;
import com.clinic.entity.User;
import com.clinic.entity.Visit;
import com.clinic.util.DoctorProfile;
import java.util.Map;

/**
 * Dữ liệu một dòng của từng bảng dưới dạng JSON (đủ các cột, đúng tên cột), giống object Prisma trả về ở bản cũ.
 * Đây là phần "View" của mô hình MVC: Controller trả các object này, Spring chuyển thành JSON.
 */
public final class Rows {
  private Rows() {}

  /** Thông tin tài khoản trả về cho client (không bao giờ kèm passwordHash). */
  public static Map<String, Object> publicUser(User u) {
    return Json.obj("id", u.getId(), "fullName", u.getFullName(), "phone", u.getPhone(), "email", u.getEmail(),
        "role", u.getRole(), "isActive", u.isActive(), "mustChangePassword", u.isMustChangePassword());
  }

  public static Map<String, Object> specialty(Specialty s) {
    return Json.obj("id", s.getId(), "name", s.getName(), "description", s.getDescription(), "symptoms", DoctorProfile.splitExpertise(s.getSymptoms()));
  }

  public static Map<String, Object> doctor(Doctor d) {
    return Json.obj("id", d.getId(), "userId", d.getUserId(), "specialtyId", d.getSpecialtyId(), "title", d.getTitle(),
        "bio", d.getBio(), "room", d.getRoom(), "practiceSince", d.getPracticeSince(), "expertise", d.getExpertise());
  }

  public static Map<String, Object> history(DoctorHistory h) {
    return Json.obj("id", h.getId(), "doctorId", h.getDoctorId(), "kind", h.getKind(), "fromYear", h.getFromYear(),
        "toYear", h.getToYear(), "title", h.getTitle(), "place", h.getPlace());
  }

  public static Map<String, Object> schedule(Schedule s) {
    return Json.obj("id", s.getId(), "doctorId", s.getDoctorId(), "date", s.getDate(), "startTime", s.getStartTime(),
        "endTime", s.getEndTime(), "isBooked", s.isBooked());
  }

  public static Map<String, Object> appointment(Appointment a) {
    return Json.obj("id", a.getId(), "patientId", a.getPatientId(), "scheduleId", a.getScheduleId(), "status", a.getStatus(),
        "reason", a.getReason(), "createdAt", a.getCreatedAt(), "remindedDayAt", a.getRemindedDayAt(),
        "remindedHourAt", a.getRemindedHourAt());
  }

  /** Đủ các cột của hồ sơ bệnh nhân (chỉ dùng nội bộ; trả cho client thì qua PatientViews). */
  public static Map<String, Object> patient(Patient p) {
    return Json.obj("id", p.getId(), "userId", p.getUserId(), "fullName", p.getFullName(), "dateOfBirth", p.getDateOfBirth(),
        "gender", p.getGender(), "phone", p.getPhone(), "nationalId", p.getNationalId(), "address", p.getAddress(),
        "insuranceNo", p.getInsuranceNo(), "insuranceExpiry", p.getInsuranceExpiry(), "allergies", p.getAllergies(),
        "occupation", p.getOccupation(), "ethnicity", p.getEthnicity(), "relativeName", p.getRelativeName(),
        "relativePhone", p.getRelativePhone(), "createdAt", p.getCreatedAt(), "linkCode", p.getLinkCode(),
        "historyLockedBefore", p.getHistoryLockedBefore(), "verifiedAt", p.getVerifiedAt(),
        "verifyFailures", p.getVerifyFailures(), "verifyLockedUntil", p.getVerifyLockedUntil());
  }

  public static Map<String, Object> visit(Visit v) {
    return Json.obj("id", v.getId(), "patientId", v.getPatientId(), "doctorId", v.getDoctorId(), "date", v.getDate(),
        "queueNumber", v.getQueueNumber(), "source", v.getSource(), "checkinMethod", v.getCheckinMethod(),
        "status", v.getStatus(), "reason", v.getReason(), "appointmentId", v.getAppointmentId(),
        "appointmentAt", v.getAppointmentAt(), "checkinOverride", v.isCheckinOverride(), "calledAt", v.getCalledAt(),
        "callRule", v.getCallRule(), "resultMode", v.getResultMode(), "sentForTestsAt", v.getSentForTestsAt(),
        "resultsReadyAt", v.getResultsReadyAt(), "completedAt", v.getCompletedAt(), "createdAt", v.getCreatedAt());
  }

  public static Map<String, Object> record(MedicalRecord r) {
    return Json.obj("id", r.getId(), "visitId", r.getVisitId(), "reason", r.getReason(), "symptoms", r.getSymptoms(),
        "personalHistory", r.getPersonalHistory(), "familyHistory", r.getFamilyHistory(), "pulse", r.getPulse(),
        "temperature", r.getTemperature(), "bpSystolic", r.getBpSystolic(), "bpDiastolic", r.getBpDiastolic(),
        "respiratoryRate", r.getRespiratoryRate(), "spo2", r.getSpo2(), "weight", r.getWeight(), "height", r.getHeight(),
        "generalExam", r.getGeneralExam(), "organExam", r.getOrganExam(), "labSummary", r.getLabSummary(),
        "orders", r.getOrders(), "diagnosis", r.getDiagnosis(), "icdCode", r.getIcdCode(),
        "secondaryDiagnosis", r.getSecondaryDiagnosis(), "secondaryIcdCodes", r.getSecondaryIcdCodes(),
        "treatment", r.getTreatment(), "followUpDate", r.getFollowUpDate(), "createdAt", r.getCreatedAt(),
        "updatedAt", r.getUpdatedAt());
  }

  public static Map<String, Object> labOrder(LabOrder o) {
    return Json.obj("id", o.getId(), "visitId", o.getVisitId(), "name", o.getName(), "note", o.getNote(),
        "resultText", o.getResultText(), "doneAt", o.getDoneAt(), "createdAt", o.getCreatedAt());
  }

  public static Map<String, Object> medicine(Medicine m) {
    return Json.obj("id", m.getId(), "name", m.getName(), "activeIngredient", m.getActiveIngredient(),
        "strength", m.getStrength(), "unit", m.getUnit(), "isActive", m.isActive());
  }

  public static Map<String, Object> prescription(Prescription p) {
    return Json.obj("id", p.getId(), "code", p.getCode(), "visitId", p.getVisitId(), "doctorId", p.getDoctorId(),
        "advice", p.getAdvice(), "status", p.getStatus(), "finalizedAt", p.getFinalizedAt(), "replacesId", p.getReplacesId(),
        "createdAt", p.getCreatedAt());
  }

  public static Map<String, Object> prescriptionItem(PrescriptionItem i) {
    return Json.obj("id", i.getId(), "prescriptionId", i.getPrescriptionId(), "medicineId", i.getMedicineId(),
        "quantity", i.getQuantity(), "dosePerTime", i.getDosePerTime(), "timesPerDay", i.getTimesPerDay(),
        "days", i.getDays(), "note", i.getNote());
  }

  public static Map<String, Object> notification(Notification n) {
    return Json.obj("id", n.getId(), "userId", n.getUserId(), "type", n.getType(), "title", n.getTitle(), "body", n.getBody(),
        "url", n.getUrl(), "visitId", n.getVisitId(), "appointmentId", n.getAppointmentId(), "readAt", n.getReadAt(),
        "createdAt", n.getCreatedAt());
  }
}
