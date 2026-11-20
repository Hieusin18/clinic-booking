package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.Role;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.service.FollowUpService;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Hẹn tái khám")
class FollowUpTest extends IntegrationTest {
  @Autowired
  FollowUpService followUps;
  @Autowired
  MedicalRecordRepository records;

  String reception;
  Fixtures.Login doctor;
  Fixtures.Login patient;
  String visitId;

  @BeforeEach
  void setUp() {
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
    patient = fx.createPatient();
    visitId = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201).body().get("id").asText();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
  }

  void record(String followUp) {
    api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(Map.of("symptoms", "Ho", "diagnosis", "Viêm phế quản", "followUpDate", followUp))
        .expect(200);
  }

  String slotOn(String date) {
    api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", date, "start", "08:00", "end", "09:00", "slotMinutes", 30)).expect(201);
    return api.get("/api/doctors/" + doctor.doctor().getId() + "/schedules?date=" + date).expect(200).body().get(0).get("id").asText();
  }

  /** Chờ đến khi hộp thư có đủ {@code count} thông báo loại {@code type}; trả về các thông báo đó, mới nhất trước. */
  java.util.List<JsonNode> waitFor(String type, int count) {
    java.util.List<JsonNode> found = new java.util.ArrayList<>();
    for (int i = 0; i < 100; i++) {
      found.clear();
      api.get("/api/notifications/mine").auth(patient.token()).expect(200).body().get("items").forEach(n -> {
        if (n.get("type").asText().equals(type)) found.add(n);
      });
      if (found.size() >= count) break;
      NotificationsTest.sleep(20);
    }
    assertThat(found).hasSize(count);
    return found;
  }

  @Test
  @DisplayName("bác sĩ đặt sẵn lịch tái khám: lịch xác nhận ngay, bệnh nhân được báo; hủy thì mở lại khung giờ")
  void doctorBooks() {
    record(day(7));
    String slot = slotOn(day(7));
    JsonNode a = api.post("/api/visits/" + visitId + "/follow-up").auth(doctor.token()).send(Map.of("scheduleId", slot)).expect(201).body();
    assertThat(a.get("status").asText()).isEqualTo("CONFIRMED");
    assertThat(a.get("followUpOfVisitId").asText()).isEqualTo(visitId);
    assertThat(schedules.findById(slot).orElseThrow().isBooked()).isTrue();
    JsonNode n = waitFor("FOLLOW_UP", 1).get(0);
    assertThat(n.get("body").asText()).contains("08:00").contains("đã được xác nhận");

    assertThat(api.get("/api/visits/" + visitId).auth(doctor.token()).expect(200).body().at("/followUpAppointment/id").asText()).isEqualTo(a.get("id").asText());
    assertThat(api.get("/api/appointments/mine").auth(patient.token()).expect(200).body().at("/0/followUpOfVisitId").asText()).isEqualTo(visitId);
    api.post("/api/visits/" + visitId + "/follow-up").auth(doctor.token()).send(Map.of("scheduleId", slotOn(day(8)))).expect(409);

    // Khám xong: đã có lịch tái khám thì không báo "hãy đặt lịch"
    api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
    waitFor("VISIT_DONE", 1);
    NotificationsTest.sleep(200);
    waitFor("FOLLOW_UP", 1);

    api.delete("/api/visits/" + visitId + "/follow-up").auth(doctor.token()).expect(204);
    assertThat(appointments.findById(a.get("id").asText()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
    assertThat(schedules.findById(slot).orElseThrow().isBooked()).isFalse();
    assertThat(api.get("/api/visits/" + visitId).auth(patient.token()).expect(200).body().get("followUpAppointment").isNull()).isTrue();
  }

  @Test
  @DisplayName("đặt lịch tái khám: chỉ khung giờ của chính bác sĩ, sau ngày khám, cần có bệnh án")
  void rules() {
    String slot = slotOn(day(3));
    assertThat(api.post("/api/visits/" + visitId + "/follow-up").auth(doctor.token()).send(Map.of("scheduleId", slot)).expect(409).body().get("message")
        .asText()).contains("lưu bệnh án");
    record(day(3));
    Fixtures.Login other = fx.createDoctor();
    api.post("/api/schedules/bulk").auth(other.token()).send(Map.of("date", day(3), "start", "08:00", "end", "08:30", "slotMinutes", 30)).expect(201);
    String otherSlot = api.get("/api/doctors/" + other.doctor().getId() + "/schedules?date=" + day(3)).expect(200).body().get(0).get("id").asText();
    api.post("/api/visits/" + visitId + "/follow-up").auth(doctor.token()).send(Map.of("scheduleId", otherSlot)).expect(404);
    api.post("/api/visits/" + visitId + "/follow-up").auth(other.token()).send(Map.of("scheduleId", otherSlot)).expect(404);
    api.post("/api/visits/" + visitId + "/follow-up").auth(doctor.token()).send(Map.of()).expect(400);
    api.post("/api/visits/" + visitId + "/follow-up").auth(reception).send(Map.of("scheduleId", slot)).expect(403);
  }

  /** 9 giờ sáng hôm nay (giờ Việt Nam) */
  static Instant nineAm() {
    return VnTime.dateTime(VnTime.today(Instant.now()), java.time.LocalTime.of(9, 0));
  }

  void completedDaysAgo(int days) {
    Visit v = visits.findById(visitId).orElseThrow();
    v.setCompletedAt(Instant.now().minus(Duration.ofDays(days)));
    visits.saveAndFlush(v);
  }

  @Test
  @DisplayName("chưa đặt giờ: khám xong báo ngày hẹn; gần đến hạn mà chưa đặt lịch thì nhắc một lần")
  void remind() {
    record(day(10));
    api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
    JsonNode hint = waitFor("FOLLOW_UP", 1).get(0);
    assertThat(hint.get("title").asText()).startsWith("Bác sĩ hẹn tái khám ngày");
    assertThat(hint.get("url").asText()).isEqualTo("/book/" + doctor.doctor().getId());

    completedDaysAgo(8);
    Instant now = nineAm();
    // Còn 10 ngày: chưa nhắc
    assertThat(followUps.sweep(now)).isZero();
    MedicalRecord r = records.findByVisitId(visitId).orElseThrow();
    r.setFollowUpDate(VnTime.today(now).plusDays(2));
    records.saveAndFlush(r);
    // Ngoài giờ (22h) không nhắc
    assertThat(followUps.sweep(now.plus(Duration.ofHours(13)))).isZero();
    assertThat(followUps.sweep(now)).isEqualTo(1);
    assertThat(followUps.sweep(now)).isZero();
    assertThat(waitFor("FOLLOW_UP", 2).get(0).get("title").asText()).isEqualTo("Sắp đến hẹn tái khám ngày " + VnTime.dmy(VnTime.today(now).plusDays(2)));
  }

  @Test
  @DisplayName("bệnh nhân đã tự đặt lịch quanh ngày hẹn thì không nhắc")
  void alreadyBooked() {
    LocalDate target = VnTime.today(Instant.now()).plusDays(2);
    record(target.toString());
    api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
    completedDaysAgo(5);
    String slot = slotOn(target.plusDays(1).toString());
    api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", slot)).expect(201);
    assertThat(followUps.sweep(nineAm())).isZero();
  }
}
