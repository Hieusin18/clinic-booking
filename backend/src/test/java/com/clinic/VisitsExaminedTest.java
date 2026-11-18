package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Patient;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Bác sĩ tra cứu bệnh án đã khám (GET /visits/examined)")
class VisitsExaminedTest extends IntegrationTest {
  @Autowired
  MedicalRecordRepository records;

  Fixtures.Login doctor;
  Fixtures.Login other;

  @BeforeEach
  void setUp() {
    doctor = fx.createDoctor();
    other = fx.createDoctor();
  }

  record Made(Visit visit, Patient patient) {}

  /** Một lượt khám (mặc định đã xong) kèm bệnh án, ngày khám `date` (YYYY-MM-DD). */
  Made visit(String doctorId, String name, String date, String diagnosis, String icd, VisitStatus status, int n) {
    Patient p = new Patient();
    p.setFullName(name);
    p.setPhone(Fixtures.nextPhone());
    p.setDateOfBirth(LocalDate.parse("1980-05-05"));
    p.setGender(Gender.MALE);
    patients.saveAndFlush(p);
    Visit v = new Visit();
    v.setPatientId(p.getId());
    v.setDoctorId(doctorId);
    v.setDate(LocalDate.parse(date));
    v.setQueueNumber(n);
    v.setSource(VisitSource.WALK_IN);
    v.setCheckinMethod(CheckinMethod.RECEPTION);
    v.setStatus(status);
    visits.saveAndFlush(v);
    MedicalRecord r = new MedicalRecord();
    r.setVisitId(v.getId());
    r.setSymptoms("Ho");
    r.setDiagnosis(diagnosis);
    r.setIcdCode(icd);
    records.saveAndFlush(r);
    return new Made(v, p);
  }

  Made visit(String doctorId, String name, String date, String diagnosis, String icd) {
    return visit(doctorId, name, date, diagnosis, icd, VisitStatus.DONE, 1);
  }

  JsonNode find(String query) {
    return api.get("/api/visits/examined" + query).auth(doctor.token()).expect(200).body();
  }

  static List<String> names(JsonNode res) {
    List<String> out = new java.util.ArrayList<>();
    res.get("items").forEach(v -> out.add(v.at("/patient/fullName").asText()));
    return out;
  }

  @Test
  @DisplayName("chỉ lượt đã khám xong của chính bác sĩ, mới nhất trước, có chẩn đoán")
  void onlyMine() {
    visit(doctor.doctor().getId(), "Lê Văn Cũ", "2026-10-01", "Viêm họng cấp", "J02.9");
    Made mai = visit(doctor.doctor().getId(), "Phạm Thị Mai", "2026-11-05", "Tăng huyết áp", "I10");
    visit(doctor.doctor().getId(), "Bỏ Về", "2026-11-06", "x", null, VisitStatus.LEFT, 2);
    visit(other.doctor().getId(), "Bác Sĩ Khác", "2026-11-06", "y", null);

    JsonNode res = find("");
    assertThat(res.get("total").asInt()).isEqualTo(2);
    assertThat(names(res)).containsExactly("Phạm Thị Mai", "Lê Văn Cũ");
    JsonNode first = res.at("/items/0");
    assertThat(first.get("id").asText()).isEqualTo(mai.visit().getId());
    assertThat(first.get("status").asText()).isEqualTo("DONE");
    assertThat(first.at("/medicalRecord/diagnosis").asText()).isEqualTo("Tăng huyết áp");
    assertThat(first.at("/medicalRecord/icdCode").asText()).isEqualTo("I10");
    assertThat(first.get("prescription").isNull()).isTrue();
  }

  @Test
  @DisplayName("tìm theo tên (không phân biệt hoa thường), SĐT, chẩn đoán, mã ICD; lọc theo ngày; phân trang")
  void search() {
    Made a = visit(doctor.doctor().getId(), "Phạm Thị Mai", "2026-11-05", "Tăng huyết áp", "I10");
    visit(doctor.doctor().getId(), "Lê Văn Cũ", "2026-10-01", "Viêm họng cấp", "J02.9");
    visit(doctor.doctor().getId(), "Trần Văn Ba", "2026-11-02", "Viêm phế quản cấp", "J20.9");

    assertThat(names(find("?q=phạm thị"))).containsExactly("Phạm Thị Mai");
    assertThat(names(find("?q=" + a.patient().getPhone().substring(0, 6)))).contains("Phạm Thị Mai");
    assertThat(names(find("?q=viêm"))).containsExactly("Trần Văn Ba", "Lê Văn Cũ");
    assertThat(names(find("?q=j0"))).containsExactly("Lê Văn Cũ");
    assertThat(names(find("?from=2026-11-01&to=2026-11-04"))).containsExactly("Trần Văn Ba");
    JsonNode p2 = find("?page=2&pageSize=2");
    assertThat(p2.get("total").asInt()).isEqualTo(3);
    assertThat(names(p2)).containsExactly("Lê Văn Cũ");
  }

  @Test
  @DisplayName("chỉ bác sĩ được tra cứu; tham số sai bị từ chối")
  void access() {
    var patient = fx.createPatient();
    api.get("/api/visits/examined").auth(patient.token()).expect(403);
    api.get("/api/visits/examined?from=hôm qua").auth(doctor.token()).expect(400);
    api.get("/api/visits/examined?pageSize=500").auth(doctor.token()).expect(400);
  }
}
