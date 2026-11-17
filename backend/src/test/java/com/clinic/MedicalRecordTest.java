package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Medicine;
import com.clinic.entity.enums.Role;
import com.clinic.repository.MedicineRepository;
import com.clinic.support.Api;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Bệnh án theo mẫu Bộ Y tế và bản điện tử PDF/Word")
class MedicalRecordTest extends IntegrationTest {
  @Autowired
  MedicineRepository medicines;

  Fixtures.Login doctor;
  Fixtures.Login patient;
  String reception;
  String medId;

  /** Tên các tệp trong file zip (docx). */
  static List<String> zipEntries(byte[] zip) throws IOException {
    List<String> out = new ArrayList<>();
    try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
      for (ZipEntry e; (e = in.getNextEntry()) != null; ) out.add(e.getName());
    }
    return out;
  }

  /** Nội dung chữ của file Word (word/document.xml). */
  static String docxText(byte[] zip) throws IOException {
    try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
      for (ZipEntry e; (e = in.getNextEntry()) != null; ) {
        if (e.getName().equals("word/document.xml")) return new String(in.readAllBytes(), StandardCharsets.UTF_8).replaceAll("<[^>]+>", "");
      }
    }
    return "";
  }

  @BeforeEach
  void setUp() {
    doctor = fx.createDoctor();
    patient = fx.createPatient();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    Medicine m = new Medicine();
    m.setName("Hapacol 250");
    m.setActiveIngredient("Paracetamol");
    m.setStrength("250mg");
    m.setUnit("gói");
    medId = medicines.saveAndFlush(m).getId();
  }

  String startVisit() {
    var ticket = api.post("/api/queue/tickets").auth(reception)
        .send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId(), "reason", "Sốt, đau họng")).expect(201).body();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    return ticket.get("id").asText();
  }

  static Map<String, Object> full(Object... overrides) {
    Map<String, Object> m = new HashMap<>();
    m.put("reason", "Sốt, đau họng 2 ngày");
    m.put("symptoms", "Sốt 38,5 độ, đau rát họng tăng khi nuốt");
    m.put("personalHistory", "Chưa phát hiện bệnh lý");
    m.put("familyHistory", "");
    m.put("pulse", 88);
    m.put("temperature", 38.2);
    m.put("bpSystolic", 120);
    m.put("bpDiastolic", 75);
    m.put("respiratoryRate", 18);
    m.put("spo2", 98);
    m.put("weight", 68);
    m.put("height", 172);
    m.put("generalExam", "Tỉnh, tiếp xúc tốt");
    m.put("organExam", "Họng đỏ, amidan sưng nhẹ");
    m.put("orders", "Công thức máu");
    m.put("diagnosis", "Viêm họng cấp");
    m.put("icdCode", " j02.9 ");
    m.put("secondaryDiagnosis", "Viêm mũi dị ứng");
    m.put("secondaryIcdCodes", "j30.4,J31.0");
    m.put("treatment", "Hạ sốt, kháng sinh 5 ngày");
    m.put("followUpDate", day(5));
    for (int i = 0; i < overrides.length; i += 2) m.put((String) overrides[i], overrides[i + 1]);
    return m;
  }

  @Test
  @DisplayName("lưu đủ các mục: sinh hiệu, mã ICD-10 chuẩn hóa, ô trống thành null")
  void saveAll() {
    String visitId = startVisit();
    var res = api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(full()).expect(200).body();
    assertThat(res.get("pulse").asInt()).isEqualTo(88);
    assertThat(res.get("temperature").asDouble()).isEqualTo(38.2);
    assertThat(res.get("bpSystolic").asInt()).isEqualTo(120);
    assertThat(res.get("icdCode").asText()).isEqualTo("J02.9");
    assertThat(res.get("secondaryIcdCodes").asText()).isEqualTo("J30.4, J31.0");
    assertThat(res.get("familyHistory").isNull()).isTrue();
    assertThat(res.get("followUpDate").asText()).startsWith(day(5));

    // Xóa một ô đã nhập (gửi chuỗi rỗng / null) thì giá trị cũ bị xóa
    var cleared = api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(full("organExam", "", "pulse", null, "icdCode", ""))
        .expect(200).body();
    assertThat(cleared.get("organExam").isNull()).isTrue();
    assertThat(cleared.get("pulse").isNull()).isTrue();
    assertThat(cleared.get("icdCode").isNull()).isTrue();
  }

  @Test
  @DisplayName("chặn dữ liệu sai: mã ICD, sinh hiệu ngoài khoảng, huyết áp thiếu/ngược, tái khám không sau ngày khám")
  void invalid() {
    String visitId = startVisit();
    java.util.function.Function<Object[], Api.Req> put = patch -> api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(full(patch));
    put.apply(new Object[] {"icdCode", "viêm họng"}).expect(400);
    put.apply(new Object[] {"secondaryIcdCodes", "J30.4;J31"}).expect(400);
    put.apply(new Object[] {"temperature", 50}).expect(400);
    put.apply(new Object[] {"spo2", 101}).expect(400);
    assertThat(put.apply(new Object[] {"bpDiastolic", null}).expect(400).body().get("message").asText()).isEqualTo("Nhập đủ cả huyết áp tâm thu và tâm trương");
    assertThat(put.apply(new Object[] {"bpSystolic", 70, "bpDiastolic", 90}).expect(400).body().get("message").asText())
        .isEqualTo("Huyết áp tâm thu phải lớn hơn tâm trương");
    assertThat(put.apply(new Object[] {"followUpDate", day(0)}).expect(400).body().get("message").asText()).isEqualTo("Ngày tái khám phải sau ngày khám");
    put.apply(new Object[] {"followUpDate", "2026-13-40"}).expect(400);
  }

  @Test
  @DisplayName("tra mã ICD-10 không cần gõ dấu; chỉ bác sĩ dùng được")
  void icdSearch() {
    var res = api.get("/api/icd10?q=viem hong").auth(doctor.token()).expect(200).body();
    assertThat(res.at("/0/code").asText()).isEqualTo("J02.9");
    assertThat(res.at("/0/name").asText()).isEqualTo("Viêm họng cấp, không đặc hiệu");
    // "hong" chỉ khớp đầu từ: không lôi ra mọi bệnh có chữ "không đặc hiệu"
    assertThat(AdminTest.texts(res, "code")).doesNotContain("J01.9");
    assertThat(api.get("/api/icd10?q=j02").auth(doctor.token()).expect(200).body().at("/0/code").asText()).isEqualTo("J02.9");
    assertThat(api.get("/api/icd10?q=I10").auth(doctor.token()).expect(200).body().at("/0/code").asText()).isEqualTo("I10");
    api.get("/api/icd10?q=viem").auth(patient.token()).expect(403);
  }

  @Test
  @DisplayName("hoàn tất đơn thì được cấp mã đơn thuốc dạng xxxxxyyyyyyy-z")
  void prescriptionCode() {
    String visitId = startVisit();
    var rx = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token())
        .send(Map.of("items", List.of(Map.of("medicineId", medId, "quantity", 6, "dosePerTime", "1 gói", "timesPerDay", 3, "days", 2)))).expect(201).body();
    assertThat(rx.get("code").isNull()).isTrue();
    var done = api.post("/api/prescriptions/" + rx.get("id").asText() + "/finalize").auth(doctor.token()).expect(200).body();
    assertThat(done.get("code").asText()).matches("^PK001[0-9a-z]{7}-C$");
  }

  @Nested
  @DisplayName("Tải bản điện tử")
  class Downloads {
    String finishedVisit() {
      String visitId = startVisit();
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(full()).expect(200);
      var rx = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("advice", "Uống nhiều nước", "items",
          List.of(Map.of("medicineId", medId, "quantity", 6, "dosePerTime", "1 gói", "timesPerDay", 3, "days", 2, "note", "Khi sốt")))).expect(201).body();
      api.post("/api/prescriptions/" + rx.get("id").asText() + "/finalize").auth(doctor.token()).expect(200);
      api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
      return visitId;
    }

    @Test
    @DisplayName("bác sĩ và bệnh nhân tải được PDF")
    void pdf() {
      String visitId = finishedVisit();
      for (String who : List.of(doctor.token(), patient.token())) {
        var res = api.get("/api/visits/" + visitId + "/record.pdf").auth(who).expect(200);
        assertThat(res.header("Content-Type")).isEqualTo("application/pdf");
        assertThat(res.header("Content-Disposition")).matches("^attachment; filename=\"benh-an-BA-\\d{8}-[AB]\\d{3}\\.pdf\"$");
        assertThat(new String(res.bytes(), 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
      }
    }

    @Test
    @DisplayName("file Word có đủ bệnh án và đơn thuốc")
    void docx() throws IOException {
      String visitId = finishedVisit();
      var res = api.get("/api/visits/" + visitId + "/record.docx").auth(patient.token()).expect(200);
      assertThat(res.header("Content-Type")).contains("wordprocessingml");
      String text = docxText(res.bytes());
      for (String s : List.of("BỆNH ÁN NGOẠI TRÚ", "I. HÀNH CHÍNH", "V. CHẨN ĐOÁN", "Viêm họng cấp", "J02.9", "120/75 mmHg", "ĐƠN THUỐC",
          "Paracetamol (Hapacol 250) 250mg", "SL: 06 gói", "Uống nhiều nước", patient.patient().getFullName().toUpperCase())) {
        assertThat(text).contains(s);
      }
    }

    @Test
    @DisplayName("xem trước HTML cùng nội dung, chặn script và tài nguyên ngoài")
    void html() {
      String visitId = finishedVisit();
      // Dữ liệu người dùng chứa thẻ HTML phải hiện thành chữ, không thành thẻ
      var p = patients.findById(patient.patient().getId()).orElseThrow();
      p.setAddress("<script>alert(1)</script> Hà Nội");
      patients.saveAndFlush(p);
      var res = api.get("/api/visits/" + visitId + "/record.html").auth(patient.token()).expect(200);
      assertThat(res.header("Content-Type")).contains("text/html");
      assertThat(res.header("Content-Security-Policy")).contains("default-src 'none'");
      for (String s : List.of("BỆNH ÁN NGOẠI TRÚ", "ĐƠN THUỐC", "Viêm họng cấp", "SL: 06 gói", "&lt;script&gt;alert(1)&lt;/script&gt; Hà Nội")) {
        assertThat(res.text()).contains(s);
      }
      assertThat(res.text()).doesNotContain("<script>");
      api.get("/api/visits/" + visitId + "/record.html").auth(doctor.token()).expect(200);
      api.get("/api/visits/" + visitId + "/record.html").auth(fx.createPatient().token()).expect(404);
      api.get("/api/visits/" + visitId + "/record.html").auth(reception).expect(403);
    }

    @Test
    @DisplayName("chưa có bệnh án thì báo lỗi; người khác không tải được")
    void access() {
      String visitId = startVisit();
      assertThat(api.get("/api/visits/" + visitId + "/record.pdf").auth(doctor.token()).expect(409).body().get("message").asText())
          .isEqualTo("Lượt khám chưa có bệnh án");
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(full()).expect(200);
      var stranger = fx.createPatient();
      var other = fx.createDoctor();
      api.get("/api/visits/" + visitId + "/record.pdf").auth(stranger.token()).expect(404);
      api.get("/api/visits/" + visitId + "/record.docx").auth(other.token()).expect(404);
      api.get("/api/visits/" + visitId + "/record.pdf").auth(reception).expect(403);
    }
  }

  @Test
  @DisplayName("hồ sơ hành chính có nghề nghiệp, dân tộc, người nhà, hạn thẻ BHYT")
  void adminFields() {
    var res = api.patch("/api/patients/me").auth(patient.token()).send(Map.of("occupation", "Giáo viên", "ethnicity", "Kinh", "relativeName", "Trần Văn B",
        "relativePhone", "0912345678", "insuranceNo", "GD4010123456789", "insuranceExpiry", "2026-12-31")).expect(200).body();
    assertThat(res.get("occupation").asText()).isEqualTo("Giáo viên");
    assertThat(res.get("ethnicity").asText()).isEqualTo("Kinh");
    assertThat(res.get("relativeName").asText()).isEqualTo("Trần Văn B");
    assertThat(res.get("relativePhone").asText()).isEqualTo("0912345678");
    assertThat(res.get("insuranceExpiry").asText()).startsWith("2026-12-31");
    api.patch("/api/patients/me").auth(patient.token()).send(Map.of("relativePhone", "12345")).expect(400);
  }
}
