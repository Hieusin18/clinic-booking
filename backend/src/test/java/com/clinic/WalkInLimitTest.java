package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Schedule;
import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Khách vãng lai giữ một khung giờ trống của bác sĩ; hết khung là hết nhận")
class WalkInLimitTest extends IntegrationTest {
  String admin;
  String reception;
  Fixtures.Login doctor;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
    api.put("/api/settings").auth(admin).send(Map.of("walkInLimit", true)).expect(200);
  }

  /** Mở khung giờ hôm nay bắt đầu sau {@code fromMin} phút, mỗi khung 30 phút; trả id các khung */
  List<String> open(int fromMin, int count, boolean booked) {
    List<String> ids = new ArrayList<>();
    Instant start = Instant.now().plusSeconds(fromMin * 60L);
    for (int i = 0; i < count; i++) {
      Schedule s = new Schedule();
      s.setDoctorId(doctor.doctor().getId());
      s.setDate(VnTime.today(Instant.now()));
      s.setStartTime(start.plusSeconds(i * 1800L));
      s.setEndTime(start.plusSeconds((i + 1) * 1800L));
      s.setBooked(booked);
      ids.add(schedules.saveAndFlush(s).getId());
    }
    return ids;
  }

  JsonNode walkIn(int status, Boolean over) {
    Map<String, Object> body = new HashMap<>(Map.of("patientId", fx.createPatient().patient().getId(), "doctorId", doctor.doctor().getId()));
    if (over != null) body.put("overCapacity", over);
    return api.post("/api/queue/tickets").auth(reception).send(body).expect(status).body();
  }

  JsonNode capacity() {
    JsonNode list = api.get("/api/queue/capacity").auth(reception).expect(200).body();
    for (JsonNode c : list) if (c.get("doctorId").asText().equals(doctor.doctor().getId())) return c;
    throw new AssertionError("không thấy bác sĩ");
  }

  @Test
  @DisplayName("bác sĩ chưa mở ca: không nhận vãng lai")
  void noShift() {
    JsonNode err = walkIn(409, null);
    assertThat(err.get("code").asText()).isEqualTo("DOCTOR_OFF");
    assertThat(err.get("message").asText()).contains("không có ca khám");
    assertThat(capacity().get("accepting").asBoolean()).isFalse();
  }

  @Test
  @DisplayName("mỗi khung trống nhận một người; kín khung thì báo kín lịch, lễ tân vẫn nhận được nếu bác sĩ đồng ý")
  void full() {
    // 2 khung 30 phút trống → nhận 2 người; khung đã có người đặt không tính
    List<String> free = open(10, 2, false);
    open(70, 1, true);
    assertThat(capacity().get("remaining").asInt()).isEqualTo(2);
    JsonNode first = walkIn(201, null);
    walkIn(201, null);
    JsonNode c = capacity();
    assertThat(c.get("remaining").asInt()).isZero();
    assertThat(c.get("accepting").asBoolean()).isFalse();
    for (String id : free) assertThat(schedules.findById(id).orElseThrow().isBooked()).isTrue();

    JsonNode err = walkIn(409, null);
    assertThat(err.get("code").asText()).isEqualTo("DOCTOR_FULL");
    assertThat(err.get("message").asText()).contains("đã kín lịch");
    walkIn(201, true);

    // Khung đã giao cho khách vãng lai thì bệnh nhân không đặt online được nữa
    Fixtures.Login patient = fx.createPatient();
    api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", free.get(0))).expect(409);

    // Khách vãng lai bỏ về trước giờ khám: trả khung cho người khác
    api.patch("/api/queue/" + first.get("id").asText() + "/left").auth(reception).expect(200);
    assertThat(schedules.findById(free.get(0)).orElseThrow().isBooked()).isFalse();
    assertThat(capacity().get("remaining").asInt()).isEqualTo(1);
    walkIn(201, null);
  }

  @Test
  @DisplayName("khung đang diễn ra vẫn nhận; khung đã qua không tính")
  void currentSlot() {
    open(-40, 1, false); // đã kết thúc
    open(-10, 1, false); // đang diễn ra
    assertThat(capacity().get("remaining").asInt()).isEqualTo(1);
    walkIn(201, null);
    walkIn(409, null);
  }

  @Test
  @DisplayName("người đặt lịch check-in vẫn được (đã có khung giờ riêng); admin tắt giới hạn thì nhận như cũ")
  void appointmentsAndSettingOff() {
    walkIn(409, null);
    api.put("/api/settings").auth(admin).send(Map.of("walkInLimit", false)).expect(200);
    walkIn(201, null);
    assertThat(capacity().get("accepting").asBoolean()).isTrue();
    api.put("/api/settings").auth(doctor.token()).send(Map.of("walkInLimit", true)).expect(403);
  }
}
