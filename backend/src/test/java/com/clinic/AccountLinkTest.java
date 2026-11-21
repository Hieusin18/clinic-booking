package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.service.AccountLinkService;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Liên kết tài khoản app với hồ sơ có sẵn")
class AccountLinkTest extends IntegrationTest {
  static final String PHONE = "0987000111";

  @Autowired
  AccountLinkService linkService;

  String reception;
  Fixtures.Login doctor;
  String patientId;
  String oldVisitId;

  static Map<String, Object> register(String phone) {
    Map<String, Object> m = new HashMap<>(Map.of("fullName", "Người Đăng Ký", "phone", phone, "password", "xuanhoa2026", "dateOfBirth", "1980-02-02", "gender", "FEMALE"));
    m.putAll(Map.of("nationalId", "00" + phone, "relativeName", "Người Nhà", "relativePhone", "0912000111"));
    return m;
  }

  /** Bà A khám vãng lai (lễ tân tạo hồ sơ, có bệnh án), chưa có tài khoản app. */
  @BeforeEach
  void setUp() {
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
    var p = api.post("/api/patients").auth(reception).send(Map.of("fullName", "Nguyễn Thị A", "phone", PHONE, "dateOfBirth", "1975-05-05", "gender", "FEMALE",
        "nationalId", "001175000111", "allergies", "Penicillin", "address", "12 Láng Hạ")).expect(201).body();
    patientId = p.get("id").asText();
    oldVisitId = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patientId, "doctorId", doctor.doctor().getId())).expect(201).body()
        .get("id").asText();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + oldVisitId + "/record").auth(doctor.token()).send(Map.of("symptoms", "Ho", "diagnosis", "Viêm phế quản")).expect(200);
    api.post("/api/visits/" + oldVisitId + "/complete").auth(doctor.token()).expect(200);
  }

  String signUp() {
    return api.post("/api/auth/register").send(register(PHONE)).expect(201).body().get("accessToken").asText();
  }

  @Test
  @DisplayName("đăng ký bằng số của hồ sơ có sẵn: dùng được app nhưng không thấy bệnh án cũ, thông tin cá nhân bị che, không sửa được")
  void hiddenUntilVerified() {
    String auth = signUp();
    assertThat(api.get("/api/visits/mine").auth(auth).expect(200).body()).isEmpty();
    api.get("/api/visits/" + oldVisitId).auth(auth).expect(404);
    api.get("/api/visits/" + oldVisitId + "/record.pdf").auth(auth).expect(404);
    api.get("/api/queue/" + oldVisitId + "/position").auth(auth).expect(404);

    JsonNode me = api.get("/api/patients/me").auth(auth).expect(200).body();
    assertThat(me.get("fullName").asText()).isEqualTo("Nguyễn Thị A");
    assertThat(me.get("verified").asBoolean()).isFalse();
    assertThat(me.get("nationalId").isNull()).isTrue();
    assertThat(me.get("allergies").isNull()).isTrue();
    assertThat(me.get("address").isNull()).isTrue();
    assertThat(me.has("linkCode")).isFalse();
    assertThat(api.patch("/api/patients/me").auth(auth).send(Map.of("allergies", "Không")).expect(403).body().get("message").asText()).contains("xác minh hồ sơ");
    assertThat(patients.findById(patientId).orElseThrow().getAllergies()).isEqualTo("Penicillin");

    assertThat(api.get("/api/patients/me/link").auth(auth).expect(200).body().toString()).isEqualTo("{\"verified\":false,\"hiddenVisits\":1}");

    // Thông tin tài khoản cũng không để lộ mã liên kết hay thông tin cá nhân của hồ sơ
    JsonNode account = api.get("/api/auth/me").auth(auth).expect(200).body();
    assertThat(account.at("/patient/id").asText()).isEqualTo(patientId);
    assertThat(account.at("/patient/verified").asBoolean()).isFalse();
    for (String f : List.of("linkCode", "nationalId", "address", "allergies")) assertThat(account.get("patient").has(f)).as(f).isFalse();
    assertThat(account.toString()).doesNotContain("001175000111").doesNotContain("Penicillin").doesNotContain("Láng Hạ");

    // Lượt khám mới sau khi đăng ký thì thấy, nhưng không kèm dị ứng của hồ sơ
    JsonNode v2 = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patientId, "doctorId", doctor.doctor().getId())).expect(201).body();
    JsonNode queue = api.get("/api/queue/mine").auth(auth).expect(200).body();
    assertThat(AdminTest.texts(queue, "id")).containsExactly(v2.get("id").asText());
    assertThat(queue.toString()).doesNotContain("Penicillin");
    // Nhân viên vẫn thấy dị ứng trên phiếu
    assertThat(v2.at("/patient/allergies").asText()).isEqualTo("Penicillin");
    // Bản tự tải của lượt mới không in thông tin cá nhân của hồ sơ
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + v2.get("id").asText() + "/record").auth(doctor.token()).send(Map.of("symptoms", "Sốt", "diagnosis", "Cảm cúm")).expect(200);
    String html = api.get("/api/visits/" + v2.get("id").asText() + "/record.html").auth(auth).expect(200).text();
    assertThat(html).doesNotContain("001175000111").doesNotContain("12 Láng Hạ");
  }

  @Test
  @DisplayName("nhập đúng mã liên kết (in trên bản bác sĩ in, lễ tân xem được) thì thấy lại toàn bộ")
  void verifyByCode() {
    String auth = signUp();
    JsonNode account = api.get("/api/patients/" + patientId + "/account").auth(reception).expect(200).body();
    assertThat(account.get("status").asText()).isEqualTo("UNVERIFIED");
    String linkCode = account.get("linkCode").asText();
    assertThat(linkCode).matches("^[A-HJ-NP-Z2-9]{6}$");

    // Bản bác sĩ in có mã; bản bệnh nhân tự tải thì không
    String doctorHtml = api.get("/api/visits/" + oldVisitId + "/record.html").auth(doctor.token()).expect(200).text();
    assertThat(doctorHtml).contains("nhập mã liên kết " + linkCode);

    String code = linkCode.substring(0, 3).toLowerCase() + " " + linkCode.substring(3);
    assertThat(api.post("/api/patients/me/verify").auth(auth).send(Map.of("code", code)).expect(200).body().toString())
        .isEqualTo("{\"verified\":true,\"hiddenVisits\":0}");
    assertThat(AdminTest.texts(api.get("/api/visits/mine").auth(auth).expect(200).body(), "id")).containsExactly(oldVisitId);
    JsonNode me = api.get("/api/patients/me").auth(auth).expect(200).body();
    assertThat(me.get("verified").asBoolean()).isTrue();
    assertThat(me.get("allergies").asText()).isEqualTo("Penicillin");
    assertThat(api.get("/api/patients/" + patientId + "/account").auth(reception).expect(200).body().get("status").asText()).isEqualTo("VERIFIED");
    String html = api.get("/api/visits/" + oldVisitId + "/record.html").auth(auth).expect(200).text();
    assertThat(html).doesNotContain(linkCode);
  }

  @Test
  @DisplayName("sai mã 5 lần thì khóa nhập mã 60 phút")
  void tooManyFailures() {
    String auth = signUp();
    for (int i = 1; i < AccountLinkService.MAX_VERIFY_FAILURES; i++) {
      assertThat(api.post("/api/patients/me/verify").auth(auth).send(Map.of("code", "ZZZZZZ")).expect(400).body().get("message").asText())
          .isEqualTo("Mã liên kết không đúng");
    }
    assertThat(api.post("/api/patients/me/verify").auth(auth).send(Map.of("code", "ZZZZZZ")).expect(400).body().get("message").asText())
        .contains("thử lại sau 60 phút");
    String linkCode = api.get("/api/patients/" + patientId + "/account").auth(reception).expect(200).body().get("linkCode").asText();
    assertThat(api.post("/api/patients/me/verify").auth(auth).send(Map.of("code", linkCode)).expect(429).body().get("message").asText())
        .contains("nhờ lễ tân xác minh");
  }

  @Test
  @DisplayName("lễ tân xác minh tại quầy (đã xem CCCD)")
  void receptionVerify() {
    String auth = signUp();
    api.post("/api/patients/" + patientId + "/account/verify").auth(doctor.token()).expect(403);
    assertThat(api.post("/api/patients/" + patientId + "/account/verify").auth(reception).expect(200).body().get("status").asText()).isEqualTo("VERIFIED");
    assertThat(api.get("/api/patients/me/link").auth(auth).expect(200).body().toString()).isEqualTo("{\"verified\":true,\"hiddenVisits\":0}");
  }

  @Test
  @DisplayName("người lạ đăng ký trước bằng số của bà A: lễ tân gỡ tài khoản đó, bà A đăng ký lại được")
  void detachSquatter() {
    String squatter = signUp();
    assertThat(api.post("/api/patients/" + patientId + "/account/detach").auth(reception).expect(200).body().get("status").asText()).isEqualTo("NONE");
    api.get("/api/auth/me").auth(squatter).expect(401);
    api.post("/api/auth/login").send(Map.of("phone", PHONE, "password", "xuanhoa2026")).expect(401);

    String owner = signUp();
    api.post("/api/patients/" + patientId + "/account/verify").auth(reception).expect(200);
    assertThat(api.get("/api/visits/mine").auth(owner).expect(200).body()).hasSize(1);
    // Đã xác minh là chính chủ thì không gỡ được
    api.post("/api/patients/" + patientId + "/account/detach").auth(reception).expect(409);
  }

  @Test
  @DisplayName("đăng ký số mới (không có hồ sơ sẵn) thì không bị khóa gì")
  void newPhone() {
    String auth = api.post("/api/auth/register").send(register("0987000222")).expect(201).body().get("accessToken").asText();
    assertThat(api.get("/api/patients/me/link").auth(auth).expect(200).body().toString()).isEqualTo("{\"verified\":true,\"hiddenVisits\":0}");
    assertThat(api.get("/api/patients/me").auth(auth).expect(200).body().get("verified").asBoolean()).isTrue();
  }

  @Test
  @DisplayName("mã liên kết: không có ký tự dễ nhầm, mỗi hồ sơ một mã cố định")
  void linkCodes() {
    for (int i = 0; i < 100; i++) assertThat(AccountLinkService.newLinkCode()).matches("^[A-HJKMNP-Z2-9]{6}$");
    assertThat(AccountLinkService.normalizeCode(" ab3-x9k ")).isEqualTo("AB3X9K");
    Map<String, Object> a = linkService.accountOf(patientId);
    Map<String, Object> b = linkService.accountOf(patientId);
    assertThat(a.get("linkCode")).isEqualTo(b.get("linkCode"));
    assertThat(String.valueOf(a.get("status"))).isEqualTo("NONE");
  }
}
