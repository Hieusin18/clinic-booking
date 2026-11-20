package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Visit;
import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Đánh giá sau khi khám")
class ReviewsTest extends IntegrationTest {
  String admin;
  String reception;
  Fixtures.Login doctor;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
  }

  /** Bệnh nhân có tài khoản khám xong một lượt; trả id lượt khám. */
  String examined(Fixtures.Login patient, boolean complete) {
    String visitId = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201).body().get("id").asText();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(Map.of("symptoms", "Ho", "diagnosis", "Viêm họng")).expect(200);
    if (complete) api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
    return visitId;
  }

  JsonNode review(Fixtures.Login patient, String visitId, int rating, String comment, int status) {
    Map<String, Object> body = new HashMap<>();
    body.put("rating", rating);
    body.put("comment", comment);
    return api.put("/api/visits/" + visitId + "/review").auth(patient.token()).send(body).expect(status).body();
  }

  @Test
  @DisplayName("chấm sao và góp ý sau khi khám xong; sửa được; hồ sơ bác sĩ hiện điểm trung bình và góp ý (tên rút gọn)")
  void submitAndShow() {
    Fixtures.Login a = fx.createPatient();
    String v1 = examined(a, true);
    JsonNode state = api.get("/api/visits/" + v1 + "/review").auth(a.token()).expect(200).body();
    assertThat(state.get("canReview").asBoolean()).isTrue();
    assertThat(state.get("review").isNull()).isTrue();

    review(a, v1, 4, "  Bác sĩ tận tình  ", 200);
    JsonNode edited = review(a, v1, 5, "Bác sĩ tận tình, giải thích kỹ", 200);
    assertThat(edited.get("rating").asInt()).isEqualTo(5);

    Fixtures.Login b = fx.createPatient();
    review(b, examined(b, true), 3, null, 200); // chỉ chấm sao

    JsonNode res = api.get("/api/doctors/" + doctor.doctor().getId() + "/reviews").expect(200).body();
    assertThat(res.at("/summary/count").asInt()).isEqualTo(2);
    assertThat(res.at("/summary/average").asDouble()).isEqualTo(4.0);
    assertThat(res.at("/summary/distribution/5").asInt()).isEqualTo(1);
    assertThat(res.get("total").asInt()).isEqualTo(1); // chỉ đánh giá có lời góp ý
    JsonNode item = res.get("items").get(0);
    assertThat(item.get("comment").asText()).isEqualTo("Bác sĩ tận tình, giải thích kỹ");
    assertThat(item.get("patientName").asText()).doesNotContain(a.user().getFullName()).endsWith(".");

    JsonNode profile = api.get("/api/doctors/" + doctor.doctor().getId()).expect(200).body();
    assertThat(profile.at("/rating/average").asDouble()).isEqualTo(4.0);
    assertThat(profile.at("/rating/count").asInt()).isEqualTo(2);
  }

  @Test
  @DisplayName("góp ý có từ ngữ không phù hợp bị từ chối, không lưu gì")
  void inappropriate() {
    Fixtures.Login a = fx.createPatient();
    String v = examined(a, true);
    JsonNode err = review(a, v, 1, "Đ.m chờ cả buổi", 400);
    assertThat(err.get("code").asText()).isEqualTo("INAPPROPRIATE_COMMENT");
    assertThat(err.get("message").asText()).contains("không phù hợp");
    assertThat(count("Review", null)).isZero();
    // Viết lại lịch sự thì gửi được
    review(a, v, 1, "Chờ cả buổi, cần cải thiện", 200);
  }

  @Test
  @DisplayName("chỉ đánh giá lượt của mình, đã khám xong, trong 30 ngày; số sao 1–5")
  void rules() {
    Fixtures.Login a = fx.createPatient();
    Fixtures.Login other = fx.createPatient();
    String notDone = examined(a, false);
    assertThat(review(a, notDone, 5, null, 409).get("message").asText()).contains("sau khi đã khám xong");
    api.post("/api/visits/" + notDone + "/complete").auth(doctor.token()).expect(200);
    review(other, notDone, 5, null, 404);
    review(a, notDone, 6, null, 400);
    review(a, notDone, 0, null, 400);
    review(a, notDone, 5, "x".repeat(501), 400);

    Visit v = visits.findById(notDone).orElseThrow();
    v.setCompletedAt(Instant.now().minus(Duration.ofDays(31)));
    visits.saveAndFlush(v);
    assertThat(review(a, notDone, 5, null, 409).get("message").asText()).contains("30 ngày");
    assertThat(api.get("/api/visits/" + notDone + "/review").auth(a.token()).expect(200).body().get("canReview").asBoolean()).isFalse();
    api.put("/api/visits/" + notDone + "/review").auth(reception).send(Map.of("rating", 5)).expect(403);
  }

  @Test
  @DisplayName("admin xem mọi đánh giá, ẩn góp ý lọt bộ lọc: không còn công khai, không tính điểm")
  void moderate() {
    Fixtures.Login a = fx.createPatient();
    Fixtures.Login b = fx.createPatient();
    review(a, examined(a, true), 1, "Bác sĩ thái độ kém", 200);
    review(b, examined(b, true), 5, "Rất tốt", 200);

    JsonNode low = api.get("/api/admin/reviews?maxRating=2").auth(admin).expect(200).body();
    assertThat(low.get("total").asInt()).isEqualTo(1);
    String id = low.at("/items/0/id").asText();
    assertThat(low.at("/items/0/patient/fullName").asText()).isEqualTo(a.user().getFullName());

    JsonNode hidden = api.patch("/api/admin/reviews/" + id).auth(admin).send(Map.of("hidden", true, "reason", "Spam")).expect(200).body();
    assertThat(hidden.get("hidden").asBoolean()).isTrue();
    JsonNode pub = api.get("/api/doctors/" + doctor.doctor().getId() + "/reviews").expect(200).body();
    assertThat(pub.get("total").asInt()).isEqualTo(1);
    assertThat(pub.at("/summary/average").asDouble()).isEqualTo(5.0);
    assertThat(api.get("/api/admin/reviews?hidden=true").auth(admin).expect(200).body().get("total").asInt()).isEqualTo(1);

    api.patch("/api/admin/reviews/" + id).auth(admin).send(Map.of("hidden", false)).expect(200);
    assertThat(api.get("/api/doctors/" + doctor.doctor().getId() + "/reviews").expect(200).body().at("/summary/average").asDouble()).isEqualTo(3.0);

    api.get("/api/admin/reviews").auth(reception).expect(403);
    api.patch("/api/admin/reviews/" + id).auth(doctor.token()).send(Map.of("hidden", true)).expect(403);
  }
}
