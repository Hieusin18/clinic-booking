package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.Medicine;
import com.clinic.entity.Schedule;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.Role;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.repository.MedicineRepository;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Khám bệnh, bệnh án và đơn thuốc")
class VisitsTest extends IntegrationTest {
  @Autowired
  MedicineRepository medicines;

  @Autowired
  MedicalRecordRepository records;

  Fixtures.Login doctor;
  Fixtures.Login patient;
  String reception;
  List<Medicine> meds;

  static final Map<String, Object> RECORD = Map.of("symptoms", "Sốt 38,5 độ, đau họng 2 ngày", "diagnosis", "Viêm họng cấp", "orders", "Tái khám sau 5 ngày");

  @BeforeEach
  void setUp() {
    doctor = fx.createDoctor();
    patient = fx.createPatient();
    reception = fx.createUser(Role.RECEPTIONIST).token();
    meds = List.of(medicine("Paracetamol"), medicine("Amoxicillin"));
  }

  Medicine medicine(String name) {
    Medicine m = new Medicine();
    m.setName(name);
    m.setStrength("500mg");
    m.setUnit("viên");
    return medicines.saveAndFlush(m);
  }

  List<Map<String, Object>> items() {
    return List.of(
        Map.of("medicineId", meds.get(0).getId(), "quantity", 10, "dosePerTime", "1 viên", "timesPerDay", 2, "days", 5, "note", "Uống khi sốt trên 38,5 độ"),
        Map.of("medicineId", meds.get(1).getId(), "quantity", 15, "dosePerTime", "1 viên", "timesPerDay", 3, "days", 5, "note", "Uống sau ăn"));
  }

  /** Bệnh nhân vào hàng đợi rồi bác sĩ gọi số → phiếu khám đang khám. */
  String startVisit() {
    var ticket = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201).body();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    return ticket.get("id").asText();
  }

  @Nested
  @DisplayName("Bệnh án")
  class Records {
    @Test
    @DisplayName("bác sĩ ghi và sửa bệnh án cho bệnh nhân đang khám")
    void writeAndEdit() {
      String visitId = startVisit();
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(RECORD).expect(200);
      Map<String, Object> edit = new HashMap<>(RECORD);
      edit.put("diagnosis", "Viêm amidan cấp");
      var updated = api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(edit).expect(200).body();
      assertThat(updated.get("diagnosis").asText()).isEqualTo("Viêm amidan cấp");
      assertThat(records.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("chưa gọi số thì chưa ghi được bệnh án")
    void notCalledYet() {
      var ticket = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
          .expect(201).body();
      var res = api.put("/api/visits/" + ticket.get("id").asText() + "/record").auth(doctor.token()).send(RECORD).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Chỉ ghi được cho bệnh nhân đang khám, hãy gọi số trước");
    }

    @Test
    @DisplayName("bác sĩ khác, lễ tân và admin đều không ghi hay đọc được bệnh án")
    void access() {
      String visitId = startVisit();
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(RECORD).expect(200);
      var other = fx.createDoctor();
      var admin = fx.createUser(Role.ADMIN);
      api.put("/api/visits/" + visitId + "/record").auth(other.token()).send(RECORD).expect(404);
      api.put("/api/visits/" + visitId + "/record").auth(reception).send(RECORD).expect(403);
      api.get("/api/visits/" + visitId).auth(reception).expect(403);
      // Admin xem được (chỉ đọc) để tra cứu bệnh án, nhưng không sửa được
      api.get("/api/visits/" + visitId).auth(admin.token()).expect(200);
      api.put("/api/visits/" + visitId + "/record").auth(admin.token()).send(RECORD).expect(403);
      api.get("/api/visits/" + visitId).auth(other.token()).expect(404);
    }

    @Test
    @DisplayName("hoàn tất lượt khám cần có bệnh án; lịch hẹn chuyển sang đã khám")
    void complete() {
      Instant start = Instant.now().plusSeconds(600);
      Schedule slot = new Schedule();
      slot.setDoctorId(doctor.doctor().getId());
      slot.setDate(VnTime.today(Instant.now()));
      slot.setStartTime(start);
      slot.setEndTime(start.plusSeconds(900));
      slot.setBooked(true);
      schedules.saveAndFlush(slot);
      Appointment appt = new Appointment();
      appt.setPatientId(patient.patient().getId());
      appt.setScheduleId(slot.getId());
      appt.setStatus(AppointmentStatus.CONFIRMED);
      appointments.saveAndFlush(appt);
      var v = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId())).expect(201).body();
      String id = v.get("id").asText();
      api.post("/api/queue/call-next").auth(doctor.token()).expect(200);

      var early = api.post("/api/visits/" + id + "/complete").auth(doctor.token()).expect(409);
      assertThat(early.body().get("message").asText()).isEqualTo("Cần ghi bệnh án trước khi hoàn tất lượt khám");
      api.put("/api/visits/" + id + "/record").auth(doctor.token()).send(RECORD).expect(200);
      var done = api.post("/api/visits/" + id + "/complete").auth(doctor.token()).expect(200).body();
      assertThat(done.get("status").asText()).isEqualTo("DONE");
      assertThat(appointments.findById(appt.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.COMPLETED);
      // xong lượt này thì gọi được số tiếp theo (không bị chặn bởi lượt đang khám)
      api.post("/api/queue/call-next").auth(doctor.token()).expect(404);
    }
  }

  @Nested
  @DisplayName("Đơn thuốc")
  class Prescriptions {
    @Test
    @DisplayName("kê đơn nháp, sửa, hoàn tất; đơn hoàn tất không sửa được")
    void lifecycle() {
      String visitId = startVisit();
      var draft = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("advice", "Uống nhiều nước", "items", items()))
          .expect(201).body();
      assertThat(draft.get("status").asText()).isEqualTo("DRAFT");
      assertThat(draft.get("advice").asText()).isEqualTo("Uống nhiều nước");
      assertThat(draft.get("items")).hasSize(2);
      String id = draft.get("id").asText();

      var edited = api.patch("/api/prescriptions/" + id).auth(doctor.token()).send(Map.of("items", items().subList(0, 1))).expect(200).body();
      assertThat(edited.get("items")).hasSize(1);

      var fin = api.post("/api/prescriptions/" + id + "/finalize").auth(doctor.token()).expect(200).body();
      assertThat(fin.get("status").asText()).isEqualTo("FINALIZED");
      assertThat(fin.get("finalizedAt").isTextual()).isTrue();

      var locked = api.patch("/api/prescriptions/" + id).auth(doctor.token()).send(Map.of("items", items())).expect(409);
      assertThat(locked.body().get("message").asText()).isEqualTo("Đơn đã hoàn tất, không sửa được. Hãy tạo đơn mới để thay thế");
      api.delete("/api/prescriptions/" + id).auth(doctor.token()).expect(409);
    }

    @Test
    @DisplayName("sửa đơn đã khóa bằng cách tạo đơn thay thế; bệnh nhân chỉ thấy đơn mới nhất đã hoàn tất")
    void replacement() {
      String visitId = startVisit();
      var first = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items().subList(0, 1))).expect(201).body();
      api.post("/api/prescriptions/" + first.get("id").asText() + "/finalize").auth(doctor.token()).expect(200);

      var second = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items())).expect(201).body();
      assertThat(second.get("replacesId").asText()).isEqualTo(first.get("id").asText());

      // Đơn thay thế còn nháp: bệnh nhân vẫn thấy đơn cũ
      var seen = api.get("/api/visits/" + visitId).auth(patient.token()).expect(200).body();
      assertThat(seen.at("/prescription/id").asText()).isEqualTo(first.get("id").asText());
      assertThat(seen.has("prescriptions")).isFalse();

      api.post("/api/prescriptions/" + second.get("id").asText() + "/finalize").auth(doctor.token()).expect(200);
      seen = api.get("/api/visits/" + visitId).auth(patient.token()).expect(200).body();
      assertThat(seen.at("/prescription/id").asText()).isEqualTo(second.get("id").asText());
      assertThat(seen.at("/prescription/items")).hasSize(2);
    }

    @Test
    @DisplayName("không có hai đơn nháp cùng lúc; xóa được đơn nháp")
    void oneDraft() {
      String visitId = startVisit();
      var d = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items())).expect(201).body();
      api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items())).expect(409);
      api.delete("/api/prescriptions/" + d.get("id").asText()).auth(doctor.token()).expect(204);
      api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items())).expect(201);
    }

    @Test
    @DisplayName("từ chối đơn rỗng, thuốc ngừng dùng và thuốc ghi trùng dòng")
    void invalid() {
      String visitId = startVisit();
      var empty = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", List.of())).expect(400);
      assertThat(empty.body().get("message").toString()).contains("Đơn thuốc cần ít nhất một loại thuốc");

      Medicine m = medicines.findById(meds.get(1).getId()).orElseThrow();
      m.setActive(false);
      medicines.saveAndFlush(m);
      var inactive = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items())).expect(400);
      assertThat(inactive.body().get("message").asText()).isEqualTo("Có thuốc không tồn tại hoặc đã ngừng dùng");

      api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", List.of(items().get(0), items().get(0)))).expect(400);
    }

    @Test
    @DisplayName("không hoàn tất lượt khám khi đơn còn nháp")
    void draftBlocksCompletion() {
      String visitId = startVisit();
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(RECORD).expect(200);
      api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("items", items())).expect(201);
      var res = api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Đơn thuốc còn ở dạng nháp, hãy hoàn tất hoặc xóa đơn");
    }
  }

  @Nested
  @DisplayName("Bệnh nhân xem lại trên app")
  class History {
    @Test
    @DisplayName("lịch sử khám có bệnh án và đơn thuốc đủ thông tin để mua thuốc")
    void history() {
      String visitId = startVisit();
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(RECORD).expect(200);
      var p = api.post("/api/visits/" + visitId + "/prescriptions").auth(doctor.token()).send(Map.of("advice", "Kiêng đồ lạnh", "items", items()))
          .expect(201).body();
      api.post("/api/prescriptions/" + p.get("id").asText() + "/finalize").auth(doctor.token()).expect(200);
      api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);

      var history = api.get("/api/visits/mine").auth(patient.token()).expect(200).body();
      assertThat(history).hasSize(1);
      var v = history.get(0);
      assertThat(v.at("/medicalRecord/diagnosis").asText()).isEqualTo("Viêm họng cấp");
      assertThat(v.at("/prescription/advice").asText()).isEqualTo("Kiêng đồ lạnh");
      var item = v.at("/prescription/items").findValues("quantity").stream().anyMatch(q -> q.asInt() == 10);
      assertThat(item).isTrue();
      var first = java.util.stream.StreamSupport.stream(v.at("/prescription/items").spliterator(), false)
          .filter(i -> i.get("quantity").asInt() == 10).findFirst().orElseThrow();
      assertThat(first.get("dosePerTime").asText()).isEqualTo("1 viên");
      assertThat(first.get("timesPerDay").asInt()).isEqualTo(2);
      assertThat(first.get("days").asInt()).isEqualTo(5);
      assertThat(first.at("/medicine/name").asText()).isEqualTo("Paracetamol");
      assertThat(first.at("/medicine/strength").asText()).isEqualTo("500mg");
      assertThat(first.at("/medicine/unit").asText()).isEqualTo("viên");
    }

    @Test
    @DisplayName("bệnh nhân không xem được lượt khám của người khác")
    void stranger() {
      String visitId = startVisit();
      var stranger = fx.createPatient();
      api.get("/api/visits/" + visitId).auth(stranger.token()).expect(404);
      assertThat(api.get("/api/visits/mine").auth(stranger.token()).expect(200).body()).isEmpty();
    }

    @Test
    @DisplayName("bác sĩ xem được các lần khám trước của bệnh nhân")
    void doctorHistory() {
      String visitId = startVisit();
      api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(RECORD).expect(200);
      api.post("/api/visits/" + visitId + "/complete").auth(doctor.token()).expect(200);
      var other = fx.createDoctor();
      var res = api.get("/api/visits/history?patientId=" + patient.patient().getId()).auth(other.token()).expect(200).body();
      assertThat(res.at("/0/medicalRecord/diagnosis").asText()).isEqualTo("Viêm họng cấp");
    }
  }
}
