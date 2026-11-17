package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.Patient;
import com.clinic.entity.Schedule;
import com.clinic.entity.User;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.QrToken;
import com.clinic.util.VnTime;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Tiếp đón, hàng đợi và QR")
class QueueTest extends IntegrationTest {
  String reception;
  Fixtures.Login doctor;

  @BeforeEach
  void setUp() {
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
  }

  static String qr(long ageMs) {
    return QrToken.create("phong-kham-test", "test-qr-secret", System.currentTimeMillis() - ageMs);
  }

  static String qr() {
    return qr(0);
  }

  /** Lịch hẹn của bệnh nhân với bác sĩ, mặc định 10 phút nữa (đang trong khung check-in); ngày mặc định hôm nay. */
  Appointment bookToday(String patientId, LocalDate date, int minutesFromNow) {
    Instant start = Instant.now().plusSeconds(minutesFromNow * 60L);
    Schedule s = new Schedule();
    s.setDoctorId(doctor.doctor().getId());
    s.setDate(date);
    s.setStartTime(start);
    s.setEndTime(start.plusSeconds(900));
    s.setBooked(true);
    schedules.saveAndFlush(s);
    Appointment a = new Appointment();
    a.setPatientId(patientId);
    a.setScheduleId(s.getId());
    a.setStatus(AppointmentStatus.CONFIRMED);
    a.setReason("Ho kéo dài");
    return appointments.saveAndFlush(a);
  }

  Appointment bookToday(String patientId) {
    return bookToday(patientId, VnTime.today(Instant.now()), 10);
  }

  Patient walkInPatient() {
    Patient p = new Patient();
    p.setFullName("Bà Tư");
    p.setPhone(Fixtures.nextPhone());
    p.setDateOfBirth(LocalDate.parse("1950-05-05"));
    p.setGender(Gender.FEMALE);
    return patients.saveAndFlush(p);
  }

  com.fasterxml.jackson.databind.JsonNode ticket(String patientId) {
    return api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patientId, "doctorId", doctor.doctor().getId())).expect(201).body();
  }

  @Nested
  @DisplayName("Hồ sơ bệnh nhân (lễ tân)")
  class Records {
    @Test
    @DisplayName("tìm theo SĐT, tạo mới khi chưa có, không cho trùng SĐT hoặc CCCD")
    void searchAndCreate() {
      String phone = Fixtures.nextPhone();
      assertThat(api.get("/api/patients?q=" + phone).auth(reception).expect(200).body().get("total").asInt()).isZero();
      Map<String, Object> body = new HashMap<>(Map.of("fullName", "Trần Văn Tám", "phone", phone, "dateOfBirth", "1960-01-01", "gender", "MALE",
          "nationalId", "001060000001", "allergies", "Aspirin"));
      api.post("/api/patients").auth(reception).send(body).expect(201);
      assertThat(api.get("/api/patients?q=" + phone).auth(reception).expect(200).body().at("/items/0/allergies").asText()).isEqualTo("Aspirin");
      assertThat(api.get("/api/patients?q=001060000001").auth(reception).expect(200).body().get("total").asInt()).isEqualTo(1);
      api.post("/api/patients").auth(reception).send(body).expect(409);
      body.put("phone", Fixtures.nextPhone());
      api.post("/api/patients").auth(reception).send(body).expect(409);
    }

    @Test
    @DisplayName("CCCD sai định dạng trả 400")
    void badNationalId() {
      var res = api.post("/api/patients").auth(reception)
          .send(Map.of("fullName", "A B", "phone", Fixtures.nextPhone(), "dateOfBirth", "1990-01-01", "gender", "MALE", "nationalId", "123")).expect(400);
      assertThat(res.body().get("message").toString()).contains("Số CCCD phải gồm 12 chữ số");
    }

    @Test
    @DisplayName("bệnh nhân xem và sửa hồ sơ của mình nhưng không gọi được API tìm kiếm")
    void selfService() {
      var p = fx.createPatient();
      var updated = api.patch("/api/patients/me").auth(p.token()).send(Map.of("allergies", "Hải sản", "address", "Hà Đông")).expect(200).body();
      assertThat(updated.get("allergies").asText()).isEqualTo("Hải sản");
      assertThat(updated.get("address").asText()).isEqualTo("Hà Đông");
      assertThat(updated.get("phone").asText()).isEqualTo(p.patient().getPhone());
      api.get("/api/patients").auth(p.token()).expect(403);
    }
  }

  @Nested
  @DisplayName("Cấp số và check-in tại quầy")
  class Tickets {
    @Test
    @DisplayName("lễ tân cấp số cho bệnh nhân đến trực tiếp, số tăng dần")
    void walkIn() {
      var t1 = ticket(walkInPatient().getId());
      var t2 = ticket(walkInPatient().getId());
      assertThat(List.of(t1.get("queueNumber").asInt(), t2.get("queueNumber").asInt())).containsExactly(1, 2);
      assertThat(t1.get("source").asText()).isEqualTo("WALK_IN");
      assertThat(t1.get("checkinMethod").asText()).isEqualTo("RECEPTION");
      assertThat(t1.get("status").asText()).isEqualTo("WAITING");
    }

    @Test
    @DisplayName("20 yêu cầu lấy số đồng thời cho cùng bác sĩ: số không trùng, liền mạch 1–20")
    void concurrentNumbers() {
      List<Patient> list = new ArrayList<>();
      for (int i = 0; i < 20; i++) list.add(walkInPatient());
      List<CompletableFuture<com.clinic.support.Api.Res>> calls = list.stream().map(p -> CompletableFuture.supplyAsync(() ->
          api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.getId(), "doctorId", doctor.doctor().getId())).call())).toList();
      List<com.clinic.support.Api.Res> results = calls.stream().map(CompletableFuture::join).toList();
      assertThat(results).allMatch(r -> r.status() == 201);
      List<Integer> numbers = results.stream().map(r -> r.body().get("queueNumber").asInt()).sorted().toList();
      assertThat(numbers).isEqualTo(IntStream.rangeClosed(1, 20).boxed().toList());
    }

    @Test
    @DisplayName("một bệnh nhân chỉ giữ một số đang chờ cho mỗi chuyên khoa")
    void oneTicketPerSpecialty() {
      Patient p = walkInPatient();
      var sameSpecialty = fx.createDoctor(doctor.doctor().getSpecialtyId());
      var otherSpecialty = fx.createDoctor(fx.createSpecialty().getId());
      ticket(p.getId());
      var res = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.getId(), "doctorId", sameSpecialty.doctor().getId())).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Bệnh nhân đang giữ số B01 cho chuyên khoa này");
      api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.getId(), "doctorId", otherSpecialty.doctor().getId())).expect(201);
    }

    @Test
    @DisplayName("check-in lịch hẹn hôm nay; không check-in hai lần; không check-in lịch ngày khác")
    void checkIn() {
      var p = fx.createPatient();
      Appointment appt = bookToday(p.patient().getId());
      var res = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId())).expect(201).body();
      assertThat(res.get("source").asText()).isEqualTo("ONLINE");
      assertThat(res.get("checkinMethod").asText()).isEqualTo("RECEPTION");
      assertThat(res.get("reason").asText()).isEqualTo("Ho kéo dài");
      assertThat(res.get("appointmentId").asText()).isEqualTo(appt.getId());
      api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId())).expect(409);

      var p2 = fx.createPatient();
      Appointment later = bookToday(p2.patient().getId(), VnTime.today(Instant.now()).plusDays(1), 10);
      var wrongDay = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", later.getId())).expect(409);
      assertThat(wrongDay.body().get("message").asText()).isEqualTo("Lịch hẹn không phải hôm nay");
    }

    @Test
    @DisplayName("không cấp số cho bác sĩ đã bị khóa")
    void lockedDoctor() {
      Patient p = walkInPatient();
      User u = users.findById(doctor.user().getId()).orElseThrow();
      u.setActive(false);
      users.saveAndFlush(u);
      api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.getId(), "doctorId", doctor.doctor().getId())).expect(404);
    }
  }

  @Nested
  @DisplayName("Quét QR tại quầy")
  class Scan {
    @Test
    @DisplayName("bệnh nhân đã đặt lịch hôm nay: quét là tự check-in")
    void autoCheckIn() {
      var p = fx.createPatient();
      Appointment appt = bookToday(p.patient().getId());
      var res = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", qr())).expect(201).body();
      assertThat(res.get("appointmentId").asText()).isEqualTo(appt.getId());
      assertThat(res.get("source").asText()).isEqualTo("ONLINE");
      assertThat(res.get("checkinMethod").asText()).isEqualTo("QR");
      assertThat(res.get("queueNumber").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("chưa đặt lịch: phải chọn bác sĩ, rồi được cấp số mới")
    void needsDoctor() {
      var p = fx.createPatient();
      var missing = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", qr())).expect(400);
      assertThat(missing.body().get("message").asText()).isEqualTo("Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ");
      var res = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", qr(), "doctorId", doctor.doctor().getId(), "reason", "Sốt"))
          .expect(201).body();
      assertThat(res.get("source").asText()).isEqualTo("WALK_IN");
      assertThat(res.get("checkinMethod").asText()).isEqualTo("QR");
      assertThat(res.get("reason").asText()).isEqualTo("Sốt");
      assertThat(res.at("/patient/id").asText()).isEqualTo(p.patient().getId());
    }

    @Test
    @DisplayName("mã QR quá 60 giây hoặc bị sửa thì từ chối")
    void expiredOrTampered() {
      var p = fx.createPatient();
      var expired = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", qr(61_000), "doctorId", doctor.doctor().getId())).expect(400);
      assertThat(expired.body().get("message").asText()).isEqualTo("Mã QR đã hết hạn, vui lòng quét lại mã trên màn hình");
      api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", qr() + "x", "doctorId", doctor.doctor().getId())).expect(400);
    }

    @Test
    @DisplayName("bệnh nhân lấy từ JWT: không lấy số hộ người khác được")
    void ownTicketOnly() {
      var p = fx.createPatient();
      var other = fx.createPatient();
      var res = api.post("/api/queue/scan").auth(p.token())
          .send(Map.of("token", qr(), "doctorId", doctor.doctor().getId(), "patientId", other.patient().getId())).expect(201);
      assertThat(res.body().at("/patient/id").asText()).isEqualTo(p.patient().getId());
    }
  }

  @Nested
  @DisplayName("Gọi số và theo dõi số thứ tự")
  class Calling {
    @Test
    @DisplayName("gọi số theo thứ tự; phải xong lượt đang khám mới gọi tiếp; hết người thì 404")
    void callInOrder() {
      ticket(walkInPatient().getId());
      var t2 = ticket(walkInPatient().getId());
      var first = api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body();
      assertThat(first.get("queueNumber").asInt()).isEqualTo(1);
      assertThat(first.get("status").asText()).isEqualTo("IN_PROGRESS");
      var blocked = api.post("/api/queue/call-next").auth(doctor.token()).expect(409);
      assertThat(blocked.body().get("message").asText()).isEqualTo("Bạn đang khám số B01, hãy hoàn tất trước khi gọi tiếp");

      api.patch("/api/queue/" + first.get("id").asText() + "/left").auth(doctor.token()).expect(200);
      var second = api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body();
      assertThat(second.get("id").asText()).isEqualTo(t2.get("id").asText());
      api.patch("/api/queue/" + second.get("id").asText() + "/left").auth(doctor.token()).expect(200);
      api.post("/api/queue/call-next").auth(doctor.token()).expect(404);
    }

    @Test
    @DisplayName("bác sĩ chỉ thấy hàng đợi của mình và không đánh dấu được bệnh nhân của bác sĩ khác")
    void ownQueueOnly() {
      var other = fx.createDoctor();
      var t = ticket(walkInPatient().getId());
      assertThat(api.get("/api/queue/doctor").auth(other.token()).expect(200).body()).isEmpty();
      assertThat(api.get("/api/queue/doctor").auth(doctor.token()).expect(200).body()).hasSize(1);
      api.patch("/api/queue/" + t.get("id").asText() + "/left").auth(other.token()).expect(404);
    }

    @Test
    @DisplayName("bỏ về thì lịch hẹn chuyển sang vắng mặt")
    void leftMeansNoShow() {
      var p = fx.createPatient();
      Appointment appt = bookToday(p.patient().getId());
      var v = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId())).expect(201).body();
      api.patch("/api/queue/" + v.get("id").asText() + "/left").auth(reception).expect(200);
      assertThat(appointments.findById(appt.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.NO_SHOW);
    }

    @Test
    @DisplayName("màn hình số thứ tự: số người phía trước và số đang khám; chỉ chủ phiếu xem được")
    void position() {
      ticket(walkInPatient().getId());
      ticket(walkInPatient().getId());
      var me = fx.createPatient();
      var mine = api.post("/api/queue/scan").auth(me.token()).send(Map.of("token", qr(), "doctorId", doctor.doctor().getId())).expect(201).body();
      String id = mine.get("id").asText();

      var pos = api.get("/api/queue/" + id + "/position").auth(me.token()).expect(200).body();
      assertThat(pos.get("peopleAhead").asInt()).isEqualTo(2);
      assertThat(pos.get("current").isNull()).isTrue();
      assertThat(pos.get("label").asText()).isEqualTo("B03");
      assertThat(pos.at("/visit/queueNumber").asInt()).isEqualTo(3);

      api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
      pos = api.get("/api/queue/" + id + "/position").auth(me.token()).expect(200).body();
      assertThat(pos.get("peopleAhead").asInt()).isEqualTo(1);
      assertThat(pos.at("/current/queueNumber").asInt()).isEqualTo(1);
      assertThat(pos.at("/current/source").asText()).isEqualTo("WALK_IN");
      assertThat(pos.get("currentLabel").asText()).isEqualTo("B01");

      assertThat(api.get("/api/queue/mine").auth(me.token()).expect(200).body().at("/0/id").asText()).isEqualTo(id);
      var stranger = fx.createPatient();
      api.get("/api/queue/" + id + "/position").auth(stranger.token()).expect(404);
    }

    @Test
    @DisplayName("lễ tân xem hàng đợi hôm nay lọc theo bác sĩ")
    void todayByDoctor() {
      ticket(walkInPatient().getId());
      var res = api.get("/api/queue/today?doctorId=" + doctor.doctor().getId()).auth(reception).expect(200).body();
      assertThat(res).hasSize(1);
      assertThat(res.at("/0/patient/fullName").asText()).isEqualTo("Bà Tư");
    }
  }
}
