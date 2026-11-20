package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Lịch làm việc bác sĩ và lễ tân (admin xem, xếp ca trực lễ tân)")
class WorkScheduleTest extends IntegrationTest {
  String admin;
  Fixtures.Login doctor;
  Fixtures.Login reception;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    doctor = fx.createDoctor();
    reception = fx.createUser(Role.RECEPTIONIST, "Lễ tân A");
  }

  String range() {
    return "?from=" + day(0) + "&to=" + day(6);
  }

  JsonNode shift(String date, String start, String end, int status) {
    Map<String, Object> body = new HashMap<>(Map.of("userId", reception.user().getId(), "date", date, "start", start, "end", end));
    body.put("note", " Quầy 1 ");
    return api.post("/api/shifts").auth(admin).send(body).expect(status).body();
  }

  @Test
  @DisplayName("ca khám bác sĩ gộp từ các khung giờ liền nhau, kèm số lượt đã đặt")
  void doctorBlocks() {
    api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "08:00", "end", "10:00", "slotMinutes", 30)).expect(201);
    api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "14:00", "end", "15:00", "slotMinutes", 30)).expect(201);
    String slot = api.get("/api/doctors/" + doctor.doctor().getId() + "/schedules?date=" + day(1)).expect(200).body().get(0).get("id").asText();
    String patient = fx.createPatient().token();
    api.post("/api/appointments").auth(patient).send(Map.of("scheduleId", slot, "reason", "Ho")).expect(201);

    JsonNode res = api.get("/api/work-schedule" + range()).auth(admin).expect(200).body();
    JsonNode doc = res.get("doctors").get(0);
    assertThat(doc.get("fullName").asText()).isEqualTo(doctor.user().getFullName());
    assertThat(doc.get("shifts")).hasSize(2);
    JsonNode morning = doc.get("shifts").get(0);
    assertThat(morning.get("date").asText()).isEqualTo(day(1));
    assertThat(morning.get("slots").asInt()).isEqualTo(4);
    assertThat(morning.get("booked").asInt()).isEqualTo(1);
    assertThat(doc.get("shifts").get(1).get("slots").asInt()).isEqualTo(2);
    assertThat(res.get("receptionists").get(0).get("fullName").asText()).isEqualTo("Lễ tân A");
  }

  @Test
  @DisplayName("admin xếp ca, không cho trùng giờ; lễ tân xem ca của mình; xóa ca")
  void receptionShifts() {
    JsonNode created = shift(day(2), "07:00", "12:00", 201);
    assertThat(created.get("note").asText()).isEqualTo("Quầy 1");
    assertThat(shift(day(2), "11:00", "13:00", 409).get("message").asText()).contains("trùng giờ");
    shift(day(2), "12:00", "17:00", 201); // nối tiếp, không chồng
    assertThat(shift(day(-1), "07:00", "12:00", 400).get("message").asText()).contains("ngày đã qua");
    assertThat(shift(day(3), "12:00", "07:00", 400).get("message").asText()).contains("sau giờ bắt đầu");

    JsonNode res = api.get("/api/work-schedule" + range()).auth(admin).expect(200).body();
    assertThat(res.get("receptionists").get(0).get("shifts")).hasSize(2);
    assertThat(api.get("/api/shifts/mine" + range()).auth(reception.token()).expect(200).body()).hasSize(2);

    api.delete("/api/shifts/" + created.get("id").asText()).auth(admin).expect(204);
    assertThat(api.get("/api/shifts/mine" + range()).auth(reception.token()).expect(200).body()).hasSize(1);
  }

  @Test
  @DisplayName("chỉ admin xem và xếp lịch; chỉ xếp ca cho lễ tân; giới hạn khoảng ngày")
  void permissions() {
    api.get("/api/work-schedule" + range()).auth(reception.token()).expect(403);
    api.get("/api/work-schedule" + range()).auth(doctor.token()).expect(403);
    api.post("/api/shifts").auth(reception.token()).send(Map.of("userId", reception.user().getId(), "date", day(1), "start", "07:00", "end", "12:00")).expect(403);
    api.post("/api/shifts").auth(admin).send(Map.of("userId", doctor.user().getId(), "date", day(1), "start", "07:00", "end", "12:00")).expect(404);
    api.get("/api/work-schedule?from=" + day(0) + "&to=" + day(60)).auth(admin).expect(400);
    api.get("/api/work-schedule?from=" + day(0)).auth(admin).expect(400);
  }
}
