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

@DisplayName("Quy trình đo sinh hiệu: điều dưỡng gọi vào đo, đo xong bác sĩ mới gọi khám")
class VitalsFlowTest extends IntegrationTest {
  String admin;
  String reception;
  Fixtures.Login nurse;
  Fixtures.Login doctor;
  Fixtures.Login first;
  Fixtures.Login second;
  String v1;
  String v2;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    nurse = fx.createUser(Role.NURSE);
    doctor = fx.createDoctor();
    first = fx.createPatient();
    second = fx.createPatient();
    v1 = ticket(first);
    v2 = ticket(second);
    api.put("/api/settings").auth(admin).send(Map.of("vitalsBeforeExam", true)).expect(200);
  }

  String ticket(Fixtures.Login p) {
    return api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.patient().getId(), "doctorId", doctor.doctor().getId())).expect(201)
        .body().get("id").asText();
  }

  void measure(String visitId) {
    api.put("/api/visits/" + visitId + "/vitals").auth(nurse.token()).send(Map.of("temperature", 36.8, "pulse", 80)).expect(200);
  }

  @Test
  @DisplayName("điều dưỡng gọi vào đo: bệnh nhân được báo; trạng thái gọi đo / đã đo hiện cho mọi màn")
  void callIn() {
    JsonNode called = api.post("/api/visits/" + v1 + "/vitals/call").auth(nurse.token()).expect(200).body();
    assertThat(called.get("vitalsCalledAt").isTextual()).isTrue();
    assertThat(called.get("vitalsMeasuredAt").isNull()).isTrue();
    JsonNode inbox = null;
    for (int i = 0; i < 100; i++) {
      inbox = api.get("/api/notifications/mine").auth(first.token()).expect(200).body();
      if (inbox.get("items").size() > 0) break;
      NotificationsTest.sleep(20);
    }
    assertThat(inbox.at("/items/0/type").asText()).isEqualTo("VITALS_CALLED");
    assertThat(inbox.at("/items/0/title").asText()).contains("vào đo sinh hiệu");

    measure(v1);
    JsonNode today = api.get("/api/vitals/today").auth(nurse.token()).expect(200).body();
    JsonNode row = today.get(0).get("id").asText().equals(v1) ? today.get(0) : today.get(1);
    assertThat(row.get("vitalsMeasuredAt").isTextual()).isTrue();
    // Bệnh nhân xem vé số cũng thấy đã đo xong
    assertThat(api.get("/api/queue/" + v1 + "/position").auth(first.token()).expect(200).body().at("/visit/vitalsMeasuredAt").isTextual()).isTrue();

    api.post("/api/visits/" + v1 + "/vitals/call").auth(reception).expect(403);
  }

  @Test
  @DisplayName("bật quy định: bác sĩ chỉ gọi người đã đo; chưa ai đo thì báo, gọi không chờ đo được")
  void doctorWaitsForVitals() {
    JsonNode err = api.post("/api/queue/call-next").auth(doctor.token()).expect(409).body();
    assertThat(err.get("code").asText()).isEqualTo("VITALS_NOT_READY");
    assertThat(err.get("message").asText()).contains("Còn 2 bệnh nhân");

    // Người số 2 đo trước thì được gọi trước người số 1 chưa đo
    measure(v2);
    assertThat(api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body().get("id").asText()).isEqualTo(v2);
    api.put("/api/visits/" + v2 + "/record").auth(doctor.token()).send(Map.of("symptoms", "Ho", "diagnosis", "Cảm")).expect(200);
    api.post("/api/visits/" + v2 + "/complete").auth(doctor.token()).expect(200);

    api.post("/api/queue/call-next").auth(doctor.token()).expect(409);
    // Cấp cứu / điều dưỡng vắng: bác sĩ gọi không chờ đo
    assertThat(api.post("/api/queue/call-next?skipVitals=true").auth(doctor.token()).expect(200).body().get("id").asText()).isEqualTo(v1);
  }

  @Test
  @DisplayName("admin tắt quy định thì gọi như cũ; chỉ admin đổi được")
  void settingOff() {
    assertThat(api.get("/api/settings").auth(doctor.token()).expect(200).body().get("vitalsBeforeExam").asBoolean()).isTrue();
    api.put("/api/settings").auth(doctor.token()).send(Map.of("vitalsBeforeExam", false)).expect(403);
    api.put("/api/settings").auth(admin).send(Map.of()).expect(400);
    assertThat(api.put("/api/settings").auth(admin).send(Map.of("vitalsBeforeExam", false)).expect(200).body().get("vitalsBeforeExam").asBoolean()).isFalse();
    assertThat(api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body().get("id").asText()).isEqualTo(v1);
  }
}
