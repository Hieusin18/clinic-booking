package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Medicine;
import com.clinic.entity.Prescription;
import com.clinic.entity.PrescriptionItem;
import com.clinic.entity.Schedule;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.PrescriptionStatus;
import com.clinic.entity.enums.ResultMode;
import com.clinic.entity.enums.Role;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.repository.MedicineRepository;
import com.clinic.repository.PrescriptionItemRepository;
import com.clinic.repository.PrescriptionRepository;
import com.clinic.service.StatsService;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Thống kê cho admin")
class StatsTest extends IntegrationTest {
  @Autowired
  StatsService stats;
  @Autowired
  ObjectMapper mapper;
  @Autowired
  MedicineRepository medicines;
  @Autowired
  MedicalRecordRepository records;
  @Autowired
  PrescriptionRepository prescriptions;
  @Autowired
  PrescriptionItemRepository items;

  /** Giờ Việt Nam → Instant. */
  static Instant vn(String ymd, String hhmm) {
    return VnTime.dateTime(ymd, hhmm);
  }

  /** So sánh JSON, số so theo giá trị (15 bằng 15.0). */
  static void assertJson(JsonNode actual, String expected) {
    JsonNode exp;
    try {
      exp = new ObjectMapper().readTree(expected);
    } catch (Exception e) {
      throw new IllegalArgumentException(e);
    }
    boolean same = actual.equals((a, b) -> a.isNumber() && b.isNumber() ? Double.compare(a.doubleValue(), b.doubleValue()) : a.equals(b) ? 0 : 1, exp);
    assertThat(same).as("mong đợi %s nhưng là %s", exp, actual).isTrue();
  }

  @Test
  @DisplayName("hàm phụ: trung vị, phần trăm, danh sách ngày")
  void helpers() {
    assertThat(StatsService.median(List.of())).isNull();
    assertThat(StatsService.median(List.of(5.0, 1.0, 3.0))).isEqualTo(3.0);
    assertThat(StatsService.median(List.of(1.0, 2.0, 3.0, 10.0))).isEqualTo(2.5);
    assertThat(StatsService.percent(1, 3)).isEqualTo(33.3);
    assertThat(StatsService.percent(1, 0)).isNull();
    assertThat(StatsService.daysBetween(LocalDate.parse("2026-10-30"), LocalDate.parse("2026-11-02")))
        .containsExactly("2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02");
  }

  @Test
  @DisplayName("chỉ admin xem được; kiểm tra khoảng ngày")
  void access() {
    String admin = fx.createUser(Role.ADMIN).token();
    var doctor = fx.createDoctor();
    api.get("/api/stats/overview?from=2026-11-01&to=2026-11-07").auth(doctor.token()).expect(403);
    api.get("/api/stats/overview?from=2026-11-01").auth(admin).expect(400);
    api.get("/api/stats/overview?from=2026-11-07&to=2026-11-01").auth(admin).expect(400);
    api.get("/api/stats/overview?from=2025-01-01&to=2026-11-01").auth(admin).expect(400);
    JsonNode empty = api.get("/api/stats/overview?from=2026-11-01&to=2026-11-07").auth(admin).expect(200).body();
    JsonNode k = empty.get("kpis");
    assertThat(k.get("visits").asInt()).isZero();
    assertThat(k.get("completed").asInt()).isZero();
    assertThat(k.get("waitMedian").isNull()).isTrue();
    assertThat(k.get("onlineShare").isNull()).isTrue();
    assertThat(k.get("noShowRate").isNull()).isTrue();
    assertThat(empty.get("daily")).hasSize(7);
    assertThat(empty.get("previousRange").toString()).isEqualTo("{\"from\":\"2026-10-25\",\"to\":\"2026-10-31\"}");
  }

  int q = 0;

  record V(String doctorId, String patientId, String day, VisitSource source, String checkin, String called, String done, String appointmentAt, String icd,
      String dx, String[] lab, VisitStatus status) {}

  Visit visit(V o) {
    Visit v = new Visit();
    v.setDoctorId(o.doctorId());
    v.setPatientId(o.patientId());
    v.setDate(LocalDate.parse(o.day()));
    v.setQueueNumber(++q);
    v.setSource(o.source());
    v.setCheckinMethod(CheckinMethod.RECEPTION);
    v.setStatus(o.status() == null ? VisitStatus.DONE : o.status());
    v.setCreatedAt(vn(o.day(), o.checkin()));
    v.setCalledAt(o.called() == null ? null : vn(o.day(), o.called()));
    v.setCompletedAt(o.done() == null ? null : vn(o.day(), o.done()));
    v.setAppointmentAt(o.appointmentAt() == null ? null : vn(o.day(), o.appointmentAt()));
    if (o.lab() != null) {
      v.setResultMode(ResultMode.RETURN);
      v.setSentForTestsAt(vn(o.day(), o.lab()[0]));
      v.setResultsReadyAt(vn(o.day(), o.lab()[1]));
    }
    visits.saveAndFlush(v);
    if (o.dx() != null) {
      MedicalRecord r = new MedicalRecord();
      r.setVisitId(v.getId());
      r.setSymptoms("s");
      r.setDiagnosis(o.dx());
      r.setIcdCode(o.icd());
      records.saveAndFlush(r);
    }
    return v;
  }

  Prescription rx(String visitId, String doctorId, PrescriptionStatus status, String replacesId, String medId, int quantity) {
    Prescription p = new Prescription();
    p.setVisitId(visitId);
    p.setDoctorId(doctorId);
    p.setStatus(status);
    p.setReplacesId(replacesId);
    prescriptions.saveAndFlush(p);
    PrescriptionItem i = new PrescriptionItem();
    i.setPrescriptionId(p.getId());
    i.setMedicineId(medId);
    i.setQuantity(quantity);
    i.setDosePerTime("1");
    i.setTimesPerDay(2);
    i.setDays(5);
    items.saveAndFlush(i);
    return p;
  }

  void appt(String doctorId, String patientId, AppointmentStatus status, Instant start) {
    Schedule s = new Schedule();
    s.setDoctorId(doctorId);
    s.setDate(LocalDate.parse(start.toString().substring(0, 10)));
    s.setStartTime(start);
    s.setEndTime(start.plusSeconds(15 * 60));
    schedules.saveAndFlush(s);
    Appointment a = new Appointment();
    a.setPatientId(patientId);
    a.setScheduleId(s.getId());
    a.setStatus(status);
    appointments.saveAndFlush(a);
  }

  /** Bác sĩ có tên cố định (bảng theo bác sĩ xếp theo tên khi bằng số lượt). */
  String doctorNamed(String name) {
    var d = fx.createDoctor();
    var u = users.findById(d.user().getId()).orElseThrow();
    u.setFullName(name);
    users.saveAndFlush(u);
    return d.doctor().getId();
  }

  @Test
  @DisplayName("tính đúng số lượt, thời gian chờ, thời gian khám, chẩn đoán, thuốc, lịch hẹn và so với kỳ trước")
  void overview() {
    String d1 = doctorNamed("Bác sĩ A");
    String d2 = doctorNamed("Bác sĩ B");
    String p1 = fx.createPatient().patient().getId();
    String p2 = fx.createPatient().patient().getId();
    Medicine m = new Medicine();
    m.setName("Paracetamol");
    m.setUnit("viên");
    String med = medicines.saveAndFlush(m).getId();
    VisitSource W = VisitSource.WALK_IN;

    // Kỳ trước (25–31/10): một lượt vãng lai của p1 → p1 không phải bệnh nhân mới trong kỳ này
    visit(new V(d1, p1, "2026-10-28", W, "08:00", "08:40", "08:50", null, "J02.9", "Viêm họng cấp", null, null));

    // Kỳ này (01–07/11). Vãng lai: chờ 20 và 30 phút; khám 10 và 6 phút
    Visit a = visit(new V(d1, p1, "2026-11-02", W, "07:40", "08:00", "08:10", null, "j02.9", "Viêm họng cấp", null, null));
    visit(new V(d1, p2, "2026-11-02", W, "13:30", "14:00", "14:06", null, "J02.9", "Viêm họng cấp", null, null));
    // Online đến sớm 20 phút, hẹn 09:00, được gọi 09:04 → chờ 4 phút (không tính 20 phút đến sớm)
    visit(new V(d2, p2, "2026-11-03", VisitSource.ONLINE, "08:40", "09:04", "09:14", "09:00", "I10", "Tăng huyết áp", null, null));
    // Đi cận lâm sàng: không tính vào thời gian khám; kết quả có sau 40 phút
    visit(new V(d2, p1, "2026-11-03", W, "10:00", "10:10", "11:30", null, null, "Viêm phổi", new String[] {"10:20", "11:00"}, null));
    // Bỏ về
    visit(new V(d1, p2, "2026-11-04", W, "09:00", null, null, null, null, null, null, VisitStatus.LEFT));

    // Đơn thuốc: đơn đã hoàn tất mới tính; đơn bị thay thì không tính
    Prescription old = rx(a.getId(), d1, PrescriptionStatus.FINALIZED, null, med, 99);
    rx(a.getId(), d1, PrescriptionStatus.FINALIZED, old.getId(), med, 10);
    rx(a.getId(), d1, PrescriptionStatus.DRAFT, null, med, 50);

    // Lịch hẹn: 1 đã khám, 1 không đến, 1 hủy, 1 tương lai (không tính vào tỷ lệ không đến)
    appt(d2, p2, AppointmentStatus.COMPLETED, vn("2026-11-03", "09:00"));
    appt(d2, p2, AppointmentStatus.NO_SHOW, vn("2026-11-03", "10:00"));
    appt(d2, p2, AppointmentStatus.CANCELLED, vn("2026-11-04", "10:00"));
    appt(d2, p2, AppointmentStatus.PENDING, vn("2026-11-07", "15:00"));

    JsonNode s = mapper.valueToTree(stats.overview("2026-11-01", "2026-11-07", vn("2026-11-07", "12:00")));
    assertJson(s.get("kpis"), """
        {"visits":5,"completed":4,"left":1,"patients":2,"newPatients":1,"onlineShare":20,"waitMedian":15,"waitOnlineMedian":4,
         "waitWalkInMedian":20,"examMedian":10,"noShowRate":50}""");
    assertThat(s.at("/previous/visits").asInt()).isEqualTo(1);
    assertThat(s.at("/previous/completed").asInt()).isEqualTo(1);
    assertThat(s.at("/previous/waitMedian").asDouble()).isEqualTo(40);
    List<JsonNode> daily = new ArrayList<>();
    s.get("daily").forEach(daily::add);
    assertJson(daily.stream().filter(x -> x.get("date").asText().equals("2026-11-02")).findFirst().orElseThrow(),
        "{\"date\":\"2026-11-02\",\"online\":0,\"walkIn\":2,\"completed\":2}");
    assertJson(daily.stream().filter(x -> x.get("date").asText().equals("2026-11-03")).findFirst().orElseThrow(),
        "{\"date\":\"2026-11-03\",\"online\":1,\"walkIn\":1,\"completed\":2}");
    List<JsonNode> hourly = new ArrayList<>();
    s.get("hourly").forEach(hourly::add);
    assertThat(hourly.get(0).get("hour").asInt()).isEqualTo(7);
    assertJson(hourly.stream().filter(h -> h.get("hour").asInt() == 7).findFirst().orElseThrow(), "{\"hour\":7,\"online\":0,\"walkIn\":1}");
    assertJson(hourly.stream().filter(h -> h.get("hour").asInt() == 8).findFirst().orElseThrow(), "{\"hour\":8,\"online\":1,\"walkIn\":0}");
    // Gộp chẩn đoán theo mã ICD (không phân biệt hoa thường)
    assertJson(s.at("/diagnoses/0"), "{\"code\":\"J02.9\",\"name\":\"Viêm họng cấp\",\"count\":2}");
    assertThat(s.get("diagnoses")).hasSize(3);
    assertJson(s.get("medicines"), "[{\"name\":\"Paracetamol\",\"unit\":\"viên\",\"prescriptions\":1,\"quantity\":10}]");
    assertJson(s.get("appointments"), "{\"total\":4,\"completed\":1,\"noShow\":1,\"cancelled\":1,\"upcoming\":1}");
    assertJson(s.get("labs"), "{\"visitsWithTests\":1,\"returnMode\":1,\"onlineMode\":0,\"turnaroundMedian\":40}");
    List<String> doctorRows = new ArrayList<>();
    s.get("doctors").forEach(d -> doctorRows.add(d.get("completed").asInt() + "/" + d.get("waitMedian").asDouble()));
    assertThat(doctorRows).containsExactly("2/25.0", "2/7.0");
  }

  @Test
  @DisplayName("hoàn tất lượt khám thì ghi lại giờ hoàn tất")
  void completedAt() {
    String reception = fx.createUser(Role.RECEPTIONIST).token();
    var doctor = fx.createDoctor();
    var patient = fx.createPatient();
    String v = api.post("/api/queue/tickets").auth(reception).send(java.util.Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201).body().get("id").asText();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + v + "/record").auth(doctor.token()).send(java.util.Map.of("symptoms", "Ho", "diagnosis", "Viêm họng")).expect(200);
    api.post("/api/visits/" + v + "/complete").auth(doctor.token()).expect(200);
    assertThat(visits.findById(v).orElseThrow().getCompletedAt()).isNotNull();
  }
}
