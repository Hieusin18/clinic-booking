package com.clinic.view;

import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.Patient;
import com.clinic.entity.Schedule;
import java.util.Map;

/** Lịch hẹn trả cho client: kèm khung giờ, bác sĩ, chuyên khoa và bệnh nhân. */
public final class AppointmentViews {
  private AppointmentViews() {}

  public static Map<String, Object> doctorBrief(Doctor d) {
    return Json.obj("id", d.getId(), "title", d.getTitle(), "user", Json.obj("fullName", d.getUser().getFullName()),
        "specialty", Json.obj("id", d.getSpecialty().getId(), "name", d.getSpecialty().getName()));
  }

  public static Map<String, Object> patientBrief(Patient p) {
    return Json.obj("id", p.getId(), "fullName", p.getFullName(), "phone", p.getPhone());
  }

  public static Map<String, Object> view(Appointment a) {
    Schedule s = a.getSchedule();
    return Json.obj(
        "id", a.getId(),
        "status", a.getStatus(),
        "reason", a.getReason(),
        "createdAt", a.getCreatedAt(),
        "schedule", Json.obj("id", s.getId(), "startTime", s.getStartTime(), "endTime", s.getEndTime(), "doctor", doctorBrief(s.getDoctor())),
        "patient", patientBrief(a.getPatient()));
  }
}
