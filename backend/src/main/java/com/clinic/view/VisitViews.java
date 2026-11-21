package com.clinic.view;

import com.clinic.entity.Doctor;
import com.clinic.entity.LabOrder;
import com.clinic.entity.Patient;
import com.clinic.entity.Visit;
import java.util.List;
import java.util.Map;

/** Phiếu khám trong hàng đợi (kèm dị ứng để bác sĩ thấy ngay). */
public final class VisitViews {
  private VisitViews() {}

  public static Map<String, Object> doctor(Doctor d) {
    return Json.obj("id", d.getId(), "title", d.getTitle(), "room", d.getRoom(), "user", Json.obj("fullName", d.getUser().getFullName()),
        "specialty", Json.obj("id", d.getSpecialty().getId(), "name", d.getSpecialty().getName()));
  }

  public static Map<String, Object> patient(Patient p) {
    return Json.obj("id", p.getId(), "fullName", p.getFullName(), "phone", p.getPhone(), "dateOfBirth", p.getDateOfBirth(),
        "gender", p.getGender(), "allergies", p.getAllergies());
  }

  /**
   * @param labOrders chỉ định cận lâm sàng của lượt khám, theo thứ tự tạo (chỉ trả tên và đã có kết quả chưa, không kèm
   *     nội dung kết quả)
   */
  public static Map<String, Object> queue(Visit v, List<LabOrder> labOrders) {
    return Json.obj(
        "id", v.getId(),
        "date", v.getDate(),
        "queueNumber", v.getQueueNumber(),
        "source", v.getSource(),
        "checkinMethod", v.getCheckinMethod(),
        "status", v.getStatus(),
        "reason", v.getReason(),
        "appointmentId", v.getAppointmentId(),
        "appointmentAt", v.getAppointmentAt(),
        "checkinOverride", v.isCheckinOverride(),
        "calledAt", v.getCalledAt(),
        "vitalsCalledAt", v.getVitalsCalledAt(),
        "vitalsMeasuredAt", v.getVitalsMeasuredAt(),
        "callRule", v.getCallRule(),
        "resultMode", v.getResultMode(),
        "sentForTestsAt", v.getSentForTestsAt(),
        "resultsReadyAt", v.getResultsReadyAt(),
        "createdAt", v.getCreatedAt(),
        "labOrders", labOrders.stream().map(o -> Json.obj("id", o.getId(), "name", o.getName(), "doneAt", o.getDoneAt())).toList(),
        "patient", patient(v.getPatient()),
        "doctor", doctor(v.getDoctor()));
  }
}
