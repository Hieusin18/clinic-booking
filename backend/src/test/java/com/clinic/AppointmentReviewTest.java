package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.Schedule;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.Role;
import com.clinic.service.AppointmentReminder;
import com.clinic.service.QueueJanitor;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Lịch đặt online chờ lễ tân duyệt (chống đặt lịch hàng loạt)")
class AppointmentReviewTest extends IntegrationTest {
  @Autowired
  QueueJanitor janitor;
  @Autowired
  AppointmentReminder reminder;

  String reception;
  Fixtures.Login doctor;
  Fixtures.Login patient;

  @BeforeEach
  void setUp() {
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
    patient = fx.createPatient();
  }

  List<JsonNode> openTomorrow() {
    api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "08:00", "end", "09:00", "slotMinutes", 15)).expect(201);
    List<JsonNode> out = new ArrayList<>();
    api.get("/api/doctors/" + doctor.doctor().getId() + "/schedules?date=" + day(1)).expect(200).body().forEach(out::add);
    return out;
  }

  String book(Fixtures.Login who, String scheduleId) {
    JsonNode res = api.post("/api/appointments").auth(who.token()).send(Map.of("scheduleId", scheduleId, "reason", "Ho")).expect(201).body();
    assertThat(res.get("status").asText()).isEqualTo("PENDING");
    return res.get("id").asText();
  }

  /** Lịch hôm nay, giờ hẹn sau {@code minutes} phút (âm = đã qua). */
  Appointment today(AppointmentStatus status, int minutes) {
    Instant start = Instant.now().plusSeconds(minutes * 60L);
    Schedule s = new Schedule();
    s.setDoctorId(doctor.doctor().getId());
    s.setDate(VnTime.today(Instant.now()));
    s.setStartTime(start);
    s.setEndTime(start.plusSeconds(900));
    s.setBooked(true);
    schedules.saveAndFlush(s);
    Appointment a = new Appointment();
    a.setPatientId(patient.patient().getId());
    a.setScheduleId(s.getId());
    a.setStatus(status);
    return appointments.saveAndFlush(a);
  }

  JsonNode inboxUntil(int size) {
    JsonNode box = api.get("/api/notifications/mine").auth(patient.token()).expect(200).body();
    for (int i = 0; i < 100 && box.get("items").size() < size; i++) {
      NotificationsTest.sleep(20);
      box = api.get("/api/notifications/mine").auth(patient.token()).expect(200).body();
    }
    assertThat(box.get("items")).hasSize(size);
    return box;
  }

  @Test
  @DisplayName("đặt lịch xong là chờ duyệt; lễ tân thấy trong danh sách kèm lịch sử của bệnh nhân; bệnh nhân không xem được danh sách")
  void pendingList() {
    var slots = openTomorrow();
    String id = book(patient, slots.get(0).get("id").asText());
    JsonNode list = api.get("/api/appointments/pending").auth(reception).expect(200).body();
    assertThat(list.get("total").asInt()).isEqualTo(1);
    JsonNode item = list.at("/items/0");
    assertThat(item.get("id").asText()).isEqualTo(id);
    assertThat(item.at("/patient/fullName").asText()).isEqualTo(patient.patient().getFullName());
    assertThat(item.at("/schedule/doctor/id").asText()).isEqualTo(doctor.doctor().getId());
    assertThat(item.at("/patientInfo/waiting").asInt()).isEqualTo(1);
    assertThat(item.at("/patientInfo/noShow").asInt()).isZero();
    assertThat(item.at("/patientInfo/accountCreatedAt").isTextual()).isTrue();
    assertThat(api.get("/api/appointments/pending/count").auth(reception).expect(200).body().get("count").asInt()).isEqualTo(1);
    api.get("/api/appointments/pending").auth(patient.token()).expect(403);
    api.post("/api/appointments/" + id + "/confirm").auth(patient.token()).expect(403);
    api.post("/api/appointments/" + id + "/confirm").auth(doctor.token()).expect(403);
  }

  @Test
  @DisplayName("lễ tân duyệt: lịch có hiệu lực, bệnh nhân được báo; duyệt lại thì báo đã xử lý")
  void confirm() {
    var slots = openTomorrow();
    String id = book(patient, slots.get(0).get("id").asText());
    JsonNode res = api.post("/api/appointments/" + id + "/confirm").auth(reception).expect(200).body();
    assertThat(res.get("status").asText()).isEqualTo("CONFIRMED");
    assertThat(res.get("reviewedAt").isTextual()).isTrue();
    assertThat(api.get("/api/appointments/pending/count").auth(reception).expect(200).body().get("count").asInt()).isZero();
    JsonNode n = inboxUntil(1).at("/items/0");
    assertThat(n.get("type").asText()).isEqualTo("APPOINTMENT_CONFIRMED");
    assertThat(n.get("title").asText()).isEqualTo("Lịch khám đã được xác nhận");
    assertThat(n.get("body").asText()).contains("08:00").contains("Đến quầy quét mã QR");
    assertThat(n.get("url").asText()).isEqualTo("/appointments");
    assertThat(api.post("/api/appointments/" + id + "/confirm").auth(reception).expect(409).body().get("message").asText())
        .isEqualTo("Lịch hẹn này đã được xử lý");
    assertThat(api.get("/api/appointments/mine").auth(patient.token()).expect(200).body().at("/0/status").asText()).isEqualTo("CONFIRMED");
  }

  @Test
  @DisplayName("lễ tân từ chối kèm lý do: khung giờ mở lại cho người khác, bệnh nhân thấy lý do")
  void reject() {
    var slots = openTomorrow();
    String slot = slots.get(0).get("id").asText();
    String id = book(patient, slot);
    assertThat(api.post("/api/appointments/" + id + "/reject").auth(reception).send(Map.of("reason", "x".repeat(301))).expect(400).body()
        .get("message").toString()).contains("reason");
    JsonNode res = api.post("/api/appointments/" + id + "/reject").auth(reception).send(Map.of("reason", "  Đặt nhiều lịch cùng lúc  ")).expect(200)
        .body();
    assertThat(res.get("status").asText()).isEqualTo("REJECTED");
    assertThat(res.get("rejectReason").asText()).isEqualTo("Đặt nhiều lịch cùng lúc");
    JsonNode n = inboxUntil(1).at("/items/0");
    assertThat(n.get("type").asText()).isEqualTo("APPOINTMENT_REJECTED");
    assertThat(n.get("body").asText()).contains("Đặt nhiều lịch cùng lúc");
    // Khung giờ trống lại, người khác đặt được
    book(fx.createPatient(), slot);
    // Lịch bị từ chối nằm trong mục "đã qua", kèm lý do
    JsonNode past = api.get("/api/appointments/mine?when=past").auth(patient.token()).expect(200).body();
    assertThat(past.at("/0/status").asText()).isEqualTo("REJECTED");
    assertThat(past.at("/0/rejectReason").asText()).isEqualTo("Đặt nhiều lịch cùng lúc");
    assertThat(api.get("/api/appointments/mine").auth(patient.token()).expect(200).body()).isEmpty();
    // Không có lý do cũng được
    String other = book(patient, slots.get(1).get("id").asText());
    assertThat(api.post("/api/appointments/" + other + "/reject").auth(reception).expect(200).body().get("rejectReason").isNull()).isTrue();
  }

  @Test
  @DisplayName("lịch chưa duyệt: bệnh nhân quét QR được mời ra quầy; lễ tân check-in là duyệt luôn")
  void checkInPending() {
    Appointment a = today(AppointmentStatus.PENDING, 10);
    JsonNode err = api.post("/api/queue/scan").auth(patient.token()).send(Map.of("token", QueueTest.qr())).expect(409).body();
    assertThat(err.get("code").asText()).isEqualTo("APPOINTMENT_PENDING");
    assertThat(err.get("message").asText()).contains("chưa được phòng khám xác nhận");
    api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", a.getId())).expect(201);
    assertThat(appointments.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
  }

  @Test
  @DisplayName("lịch chưa ai duyệt mà quá giờ: tự từ chối, không tính là không đến; không nhắc lịch khi chưa duyệt")
  void expireAndNoReminder() {
    Appointment old = today(AppointmentStatus.PENDING, -120);
    janitor.sweep(Instant.now());
    Appointment after = appointments.findById(old.getId()).orElseThrow();
    assertThat(after.getStatus()).isEqualTo(AppointmentStatus.REJECTED);
    assertThat(after.getRejectReason()).isEqualTo("Phòng khám chưa xác nhận lịch trước giờ khám");
    assertThat(api.get("/api/appointments/standing").auth(patient.token()).expect(200).body().get("recentNoShows").asInt()).isZero();

    Appointment soon = today(AppointmentStatus.PENDING, 45);
    assertThat(reminder.sweep(Instant.now())).isZero();
    soon.setStatus(AppointmentStatus.CONFIRMED);
    appointments.saveAndFlush(soon);
    assertThat(reminder.sweep(Instant.now())).isEqualTo(1);
  }
}
