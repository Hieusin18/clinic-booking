package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Admin xem bệnh án và lịch sử sửa bệnh án")
class AdminRecordsTest extends IntegrationTest {
  String admin;
  String reception;
  Fixtures.Login doctor;
  Fixtures.Login other;
  String visitId;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
    other = fx.createDoctor();
    String patientId = fx.createPatient().patient().getId();
    visitId = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patientId, "doctorId", doctor.doctor().getId())).expect(201).body()
        .get("id").asText();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
  }

  void save(Map<String, Object> body) {
    api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(body).expect(200);
  }

  JsonNode history(String token, int status) {
    return api.get("/api/visits/" + visitId + "/record/history").auth(token).expect(status).body();
  }

  static List<String> fields(JsonNode event) {
    List<String> out = new ArrayList<>();
    event.get("changes").forEach(c -> out.add(c.get("field").asText()));
    return out;
  }

  @Test
  @DisplayName("mỗi lần lưu có thay đổi ghi một bản; lưu y nguyên thì không; ghi rõ ô nào đổi, trước/sau, ai sửa, sửa sau khi hoàn tất")
  void revisions() {
    save(Map.of("symptoms", "Ho", "diagnosis", "Viêm họng", "temperature", 37));
    save(Map.of("symptoms", "Ho", "diagnosis", "Viêm họng", "temperature", 37.0)); // không đổi
    save(Map.of("symptoms", "Ho, sốt", "diagnosis", "Viêm họng cấp", "icdCode", "J02", "temperature", 37));
    api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
    save(Map.of("symptoms", "Ho, sốt", "diagnosis", "Viêm amidan", "icdCode", "J03", "temperature", 37));

    JsonNode events = history(admin, 200);
    assertThat(events).hasSize(3);
    JsonNode created = events.get(0);
    assertThat(created.get("action").asText()).isEqualTo("CREATE");
    assertThat(fields(created)).containsExactly("symptoms", "temperature", "diagnosis");
    assertThat(created.get("editedBy").get("fullName").asText()).isEqualTo(doctor.user().getFullName());

    JsonNode edit = events.get(1);
    assertThat(edit.get("action").asText()).isEqualTo("UPDATE");
    assertThat(fields(edit)).containsExactly("symptoms", "diagnosis", "icdCode");
    assertThat(edit.get("changes").get(1).get("before").asText()).isEqualTo("Viêm họng");
    assertThat(edit.get("changes").get(1).get("after").asText()).isEqualTo("Viêm họng cấp");
    assertThat(edit.get("afterDone").asBoolean()).isFalse();

    JsonNode late = events.get(2);
    assertThat(late.get("afterDone").asBoolean()).isTrue();
    assertThat(fields(late)).containsExactly("diagnosis", "icdCode");

    // Bác sĩ phụ trách xem được; bác sĩ khác, lễ tân thì không
    assertThat(history(doctor.token(), 200)).hasSize(3);
    history(other.token(), 404);
    history(reception, 403);
  }

  @Test
  @DisplayName("admin tra cứu bệnh án mọi bác sĩ, xem chi tiết và bản in; lễ tân không được")
  void listAndDetail() {
    save(Map.of("symptoms", "Đau bụng", "diagnosis", "Viêm dạ dày", "icdCode", "K29"));
    save(Map.of("symptoms", "Đau bụng", "diagnosis", "Viêm dạ dày cấp", "icdCode", "K29"));
    api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);

    JsonNode page = api.get("/api/admin/records?q=K29").auth(admin).expect(200).body();
    assertThat(page.get("total").asInt()).isEqualTo(1);
    JsonNode item = page.get("items").get(0);
    assertThat(item.get("id").asText()).isEqualTo(visitId);
    assertThat(item.get("history").get("revisions").asInt()).isEqualTo(2);
    assertThat(item.get("history").get("editedAfterDone").asBoolean()).isFalse();
    assertThat(api.get("/api/admin/records?doctorId=" + other.doctor().getId()).auth(admin).expect(200).body().get("total").asInt()).isZero();
    assertThat(api.get("/api/admin/records?q=J45").auth(admin).expect(200).body().get("total").asInt()).isZero();

    JsonNode detail = api.get("/api/visits/" + visitId).auth(admin).expect(200).body();
    assertThat(detail.get("medicalRecord").get("diagnosis").asText()).isEqualTo("Viêm dạ dày cấp");
    api.get("/api/visits/" + visitId + "/record.html").auth(admin).expect(200);

    api.get("/api/admin/records").auth(reception).expect(403);
    api.get("/api/admin/records").auth(doctor.token()).expect(403);
    // Admin chỉ xem, không sửa
    api.put("/api/visits/" + visitId + "/record").auth(admin).send(Map.of("symptoms", "x", "diagnosis", "y")).expect(403);
  }
}
