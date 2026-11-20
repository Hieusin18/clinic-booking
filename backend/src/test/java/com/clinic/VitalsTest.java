package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Điều dưỡng đo sinh hiệu trước khi khám")
class VitalsTest extends IntegrationTest {
  String admin;
  String reception;
  Fixtures.Login nurse;
  Fixtures.Login doctor;
  Fixtures.Login other;
  String visitId;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    nurse = fx.createUser(Role.NURSE, "Điều dưỡng Lan");
    doctor = fx.createDoctor();
    other = fx.createDoctor();
    String patientId = fx.createPatient().patient().getId();
    visitId = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patientId, "doctorId", doctor.doctor().getId())).expect(201).body()
        .get("id").asText();
  }

  static Map<String, Object> vitals() {
    return Map.of("pulse", 88, "temperature", 38.5, "bpSystolic", 130, "bpDiastolic", 85, "spo2", 97, "weight", 62.5, "height", 165, "note", " Sốt cao ");
  }

  @Test
  @DisplayName("điều dưỡng xem bệnh nhân hôm nay, ghi sinh hiệu; bác sĩ mở phiếu khám thấy sẵn")
  void measure() {
    JsonNode today = api.get("/api/vitals/today").auth(nurse.token()).expect(200).body();
    assertThat(today).hasSize(1);
    assertThat(today.get(0).get("vitals").isNull()).isTrue();

    JsonNode saved = api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(vitals()).expect(200).body();
    assertThat(saved.get("temperature").asDouble()).isEqualTo(38.5);
    assertThat(saved.get("note").asText()).isEqualTo("Sốt cao");
    assertThat(saved.at("/measuredBy/fullName").asText()).isEqualTo("Điều dưỡng Lan");

    assertThat(api.get("/api/vitals/today?doctorId=" + doctor.doctor().getId()).auth(nurse.token()).expect(200).body().at("/0/vitals/pulse").asInt())
        .isEqualTo(88);
    assertThat(api.get("/api/vitals/today?doctorId=" + other.doctor().getId()).auth(nurse.token()).expect(200).body()).isEmpty();

    // Bác sĩ: hàng đợi biết ai đã đo, phiếu khám có sẵn sinh hiệu
    assertThat(api.get("/api/queue/doctor").auth(doctor.token()).expect(200).body().at("/0/vitals/spo2").asInt()).isEqualTo(97);
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    assertThat(api.get("/api/visits/" + visitId).auth(doctor.token()).expect(200).body().at("/vitals/bpSystolic").asInt()).isEqualTo(130);

    // Đo lại thì ghi đè
    api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(Map.of("temperature", 37.8)).expect(200);
    JsonNode v = api.get("/api/visits/" + visitId).auth(doctor.token()).expect(200).body().get("vitals");
    assertThat(v.get("temperature").asDouble()).isEqualTo(37.8);
    assertThat(v.get("pulse").isNull()).isTrue();
  }

  @Test
  @DisplayName("kiểm tra giá trị, chỉ lượt đang chờ/đang khám; phân quyền")
  void rules() {
    api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(Map.of("temperature", 50)).expect(400);
    assertThat(api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(Map.of("bpSystolic", 120)).expect(400).body().get("message").asText())
        .contains("cả huyết áp");
    assertThat(api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(Map.of("note", "x")).expect(400).body().get("message").asText())
        .contains("ít nhất một");

    api.put("/api/visits/" + visitId + "/vitals").auth(reception).send(vitals()).expect(403);
    api.put("/api/visits/" + visitId + "/vitals").auth(other.token()).send(vitals()).expect(404);
    api.put("/api/visits/" + visitId + "/vitals").auth(doctor.token()).send(vitals()).expect(200);
    api.get("/api/vitals/today").auth(reception).expect(403);
    api.get("/api/vitals/today").auth(admin).expect(200);

    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(Map.of("symptoms", "Sốt", "diagnosis", "Cúm")).expect(200);
    api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
    assertThat(api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(vitals()).expect(409).body().get("message").asText())
        .contains("đã khám xong");
  }

  @Test
  @DisplayName("admin tạo và khóa tài khoản điều dưỡng, xếp ca trực; điều dưỡng xem ca của mình")
  void accounts() {
    String phone = Fixtures.nextPhone();
    JsonNode created = api.post("/api/staff/nurses").auth(admin).send(Map.of("fullName", "Điều dưỡng Hoa", "phone", phone, "password", "dieuduong24"))
        .expect(201).body();
    assertThat(created.get("role").asText()).isEqualTo("NURSE");
    assertThat(api.get("/api/staff/nurses").auth(admin).expect(200).body().get("total").asInt()).isEqualTo(2);
    assertThat(api.get("/api/staff/receptionists").auth(admin).expect(200).body().get("total").asInt()).isEqualTo(1);
    api.patch("/api/staff/receptionists/" + created.get("id").asText()).auth(admin).send(Map.of("isActive", false)).expect(404);
    api.patch("/api/staff/nurses/" + created.get("id").asText()).auth(admin).send(Map.of("isActive", false)).expect(200);
    api.get("/api/staff/doctors").auth(admin).expect(404);

    api.post("/api/shifts").auth(admin).send(Map.of("userId", nurse.user().getId(), "date", day(1), "start", "07:00", "end", "12:00")).expect(201);
    JsonNode week = api.get("/api/work-schedule?from=" + day(0) + "&to=" + day(6)).auth(admin).expect(200).body();
    assertThat(week.at("/nurses/0/shifts")).hasSize(1);
    assertThat(api.get("/api/shifts/mine?from=" + day(0) + "&to=" + day(6)).auth(nurse.token()).expect(200).body()).hasSize(1);
    api.post("/api/users/" + nurse.user().getId() + "/reset-password").auth(admin).expect(200);
  }
}
