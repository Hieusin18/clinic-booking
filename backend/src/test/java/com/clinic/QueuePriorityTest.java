package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.Patient;
import com.clinic.entity.Schedule;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.Role;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.service.QueueJanitor;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Ưu tiên gọi số, khung giờ check-in và lịch không đến")
class QueuePriorityTest extends IntegrationTest {
  static final long MIN = 60;
  static final long DAY_MIN = 24 * 60;

  @Autowired
  QueueJanitor janitor;

  String reception;
  Fixtures.Login doctor;

  @BeforeEach
  void setUp() {
    reception = fx.createUser(Role.RECEPTIONIST).token();
    doctor = fx.createDoctor();
  }

  /** Lịch hẹn với giờ hẹn cách hiện tại {@code minutes} phút (âm = đã qua). */
  Appointment book(String patientId, long minutes, LocalDate date, AppointmentStatus status) {
    Instant start = Instant.now().plusSeconds(minutes * MIN).plusMillis(ThreadLocalRandom.current().nextInt(1000));
    Schedule s = new Schedule();
    s.setDoctorId(doctor.doctor().getId());
    s.setDate(date != null ? date : VnTime.today(Instant.now()));
    s.setStartTime(start);
    s.setEndTime(start.plusSeconds(15 * MIN));
    s.setBooked(true);
    schedules.saveAndFlush(s);
    Appointment a = new Appointment();
    a.setPatientId(patientId);
    a.setScheduleId(s.getId());
    a.setStatus(status != null ? status : AppointmentStatus.CONFIRMED);
    return appointments.saveAndFlush(a);
  }

  Appointment book(String patientId, long minutes) {
    return book(patientId, minutes, null, null);
  }

  String newPatient() {
    return fx.createPatient().patient().getId();
  }

  JsonNode walkIn() {
    Patient p = new Patient();
    p.setFullName("Ông Năm");
    p.setPhone(Fixtures.nextPhone());
    p.setDateOfBirth(LocalDate.parse("1955-03-03"));
    p.setGender(Gender.MALE);
    patients.saveAndFlush(p);
    return api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.getId(), "doctorId", doctor.doctor().getId())).expect(201).body();
  }

  JsonNode checkIn(String appointmentId) {
    return api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appointmentId)).expect(201).body();
  }

  JsonNode callNext() {
    return api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body();
  }

  void finish(String visitId) {
    api.patch("/api/queue/" + visitId + "/left").auth(doctor.token()).expect(200);
  }

  AppointmentStatus status(String id) {
    return appointments.findById(id).orElseThrow().getStatus();
  }

  @Test
  @DisplayName("hai dãy số: đặt lịch đánh số A từ 1, vãng lai đánh số B từ 1")
  void twoSequences() {
    var b = walkIn();
    var a = checkIn(book(newPatient(), 10).getId());
    assertThat(List.of(a.get("source").asText(), a.get("queueNumber").asInt(), b.get("source").asText(), b.get("queueNumber").asInt()))
        .containsExactly("ONLINE", 1, "WALK_IN", 1);
    assertThat(a.get("appointmentAt").isNull()).isFalse();
  }

  @Nested
  @DisplayName("Khung giờ check-in")
  class Window {
    @Test
    @DisplayName("đến quá sớm: báo giờ mở check-in; lễ tân vẫn check-in ngoài giờ được")
    void tooEarly() {
      Appointment appt = book(newPatient(), 60);
      var res = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId())).expect(409).body();
      assertThat(res.get("code").asText()).isEqualTo("CHECKIN_TOO_EARLY");
      assertThat(res.get("message").asText()).matches("^Lịch hẹn lúc \\d\\d:\\d\\d mở check-in từ \\d\\d:\\d\\d\\..*");
      var ok = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId(), "override", true)).expect(201).body();
      assertThat(ok.get("source").asText()).isEqualTo("ONLINE");
      assertThat(ok.get("checkinOverride").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("bệnh nhân quét QR quá sớm cũng bị báo giờ mở check-in")
    void scanTooEarly() {
      var p = fx.createPatient();
      book(p.patient().getId(), 45);
      var res = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", QueueTest.qr())).expect(409);
      assertThat(res.body().get("code").asText()).isEqualTo("CHECKIN_TOO_EARLY");
    }

    @Test
    @DisplayName("đến trễ quá 15 phút: lịch hẹn thành không đến, phải lấy số thường (dãy B)")
    void tooLate() {
      var p = fx.createPatient();
      Appointment appt = book(p.patient().getId(), -20);
      var res = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", QueueTest.qr())).expect(400).body();
      assertThat(res.get("code").asText()).isEqualTo("NEEDS_DOCTOR");
      assertThat(res.get("message").asText()).contains("trễ quá 15 phút");
      assertThat(status(appt.getId())).isEqualTo(AppointmentStatus.NO_SHOW);
      var ticket = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", QueueTest.qr(), "doctorId", doctor.doctor().getId())).expect(201).body();
      assertThat(ticket.get("source").asText()).isEqualTo("WALK_IN");
      assertThat(ticket.get("appointmentId").isNull()).isTrue();
    }

    @Test
    @DisplayName("lễ tân check-in lịch đã bị tính không đến: lịch hẹn được khôi phục, vẫn giữ dãy A")
    void restoreNoShow() {
      Appointment appt = book(newPatient(), -40);
      var late = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId())).expect(409).body();
      assertThat(late.get("code").asText()).isEqualTo("CHECKIN_TOO_LATE");
      assertThat(late.get("appointmentAt").isTextual()).isTrue();
      assertThat(late.get("closesAt").isTextual()).isTrue();
      var ok = api.post("/api/queue/checkin").auth(reception).send(Map.of("appointmentId", appt.getId(), "override", true)).expect(201).body();
      assertThat(ok.get("source").asText()).isEqualTo("ONLINE");
      assertThat(ok.get("checkinOverride").asBoolean()).isTrue();
      assertThat(ok.get("appointmentId").asText()).isEqualTo(appt.getId());
      assertThat(status(appt.getId())).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    @Test
    @DisplayName("lễ tân thấy cả lịch đã bị tính không đến trong danh sách hôm nay")
    void receptionSeesNoShows() {
      book(newPatient(), -40, null, AppointmentStatus.NO_SHOW);
      var res = api.get("/api/appointments").auth(reception).expect(200).body();
      assertThat(AdminTest.texts(res, "status")).containsExactly("NO_SHOW");
      long start = Instant.parse(res.at("/0/schedule/startTime").asText()).toEpochMilli();
      assertThat(start - Instant.parse(res.at("/0/checkinOpensAt").asText()).toEpochMilli()).isEqualTo(30 * 60_000L);
    }
  }

  @Nested
  @DisplayName("Thứ tự gọi số")
  class Order {
    @Test
    @DisplayName("người đặt lịch đã đến giờ được gọi trước người vãng lai đến sớm hơn")
    void appointmentFirst() {
      var b = walkIn();
      var a = checkIn(book(newPatient(), 5).getId());
      var first = callNext();
      assertThat(first.get("id").asText()).isEqualTo(a.get("id").asText());
      assertThat(first.get("callRule").asText()).isEqualTo("APPOINTMENT");
      finish(first.get("id").asText());
      var second = callNext();
      assertThat(second.get("id").asText()).isEqualTo(b.get("id").asText());
      assertThat(second.get("callRule").asText()).isEqualTo("ARRIVAL");
    }

    @Test
    @DisplayName("người đặt lịch chưa đến giờ thì xếp theo thứ tự đến quầy")
    void notDueYet() {
      var b = walkIn();
      checkIn(book(newPatient(), 25).getId());
      var first = callNext();
      assertThat(first.get("id").asText()).isEqualTo(b.get("id").asText());
      assertThat(first.get("callRule").asText()).isEqualTo("ARRIVAL");
    }

    @Test
    @DisplayName("sau 3 lượt ưu tiên liên tiếp thì gọi người vãng lai đang chờ")
    void fairness() {
      var b = walkIn();
      for (int i = 1; i <= 4; i++) checkIn(book(newPatient(), i).getId());
      List<String> order = new ArrayList<>();
      for (int i = 0; i < 5; i++) {
        var v = callNext();
        order.add(v.get("callRule").asText());
        finish(v.get("id").asText());
        if (i == 3) assertThat(v.get("id").asText()).isEqualTo(b.get("id").asText());
      }
      assertThat(order).containsExactly("APPOINTMENT", "APPOINTMENT", "APPOINTMENT", "FAIRNESS", "APPOINTMENT");
    }

    @Test
    @DisplayName("bác sĩ gọi đích danh một người đang chờ")
    void manual() {
      walkIn();
      var second = walkIn();
      String id = second.get("id").asText();
      var other = fx.createDoctor();
      api.post("/api/queue/" + id + "/call").auth(other.token()).expect(404);
      var res = api.post("/api/queue/" + id + "/call").auth(doctor.token()).expect(200).body();
      assertThat(res.get("id").asText()).isEqualTo(id);
      assertThat(res.get("status").asText()).isEqualTo("IN_PROGRESS");
      assertThat(res.get("callRule").asText()).isEqualTo("MANUAL");
      finish(id);
      var again = api.post("/api/queue/" + id + "/call").auth(doctor.token()).expect(409);
      assertThat(again.body().get("message").asText()).isEqualTo("Số B02 không còn trong hàng chờ");
    }

    @Test
    @DisplayName("số người phía trước tính theo đúng thứ tự gọi; hàng đợi kèm thứ tự dự kiến")
    void forecast() {
      var p = fx.createPatient();
      var mine = api.post("/api/queue/scan").auth(p.token()).send(Map.of("token", QueueTest.qr(), "doctorId", doctor.doctor().getId())).expect(201).body();
      var booker = fx.createPatient();
      book(booker.patient().getId(), 5);
      var a = api.post("/api/queue/scan").auth(booker.token()).send(Map.of("token", QueueTest.qr())).expect(201).body();

      var posB = api.get("/api/queue/" + mine.get("id").asText() + "/position").auth(p.token()).expect(200).body();
      assertThat(posB.get("label").asText()).isEqualTo("B01");
      assertThat(posB.get("peopleAhead").asInt()).isEqualTo(1);
      assertThat(posB.get("due").asBoolean()).isFalse();
      var posA = api.get("/api/queue/" + a.get("id").asText() + "/position").auth(booker.token()).expect(200).body();
      assertThat(posA.get("label").asText()).isEqualTo("A01");
      assertThat(posA.get("peopleAhead").asInt()).isZero();
      assertThat(posA.get("due").asBoolean()).isTrue();
      assertThat(Instant.parse(posB.get("estimatedCallAt").asText())).isAfter(Instant.parse(posA.get("estimatedCallAt").asText()));

      var board = api.get("/api/queue/doctor").auth(doctor.token()).expect(200).body();
      Map<String, Integer> order = new HashMap<>();
      board.forEach(v -> order.put(v.get("id").asText(), v.get("predictedOrder").asInt()));
      assertThat(order).isEqualTo(Map.of(mine.get("id").asText(), 1, a.get("id").asText(), 0));
    }
  }

  @Nested
  @DisplayName("Tự đóng lịch không đến")
  class Janitor {
    @Test
    @DisplayName("lịch quá giờ hẹn 15 phút chưa check-in thành không đến; số còn chờ của ngày cũ thành bỏ về")
    void sweep() {
      var p = fx.createPatient();
      Appointment late = book(p.patient().getId(), -20);
      Appointment stillOk = book(newPatient(), -10);
      LocalDate yesterday = VnTime.today(Instant.now()).minusDays(1);
      Appointment old = book(newPatient(), -DAY_MIN, yesterday, null);
      Visit oldVisit = new Visit();
      oldVisit.setPatientId(old.getPatientId());
      oldVisit.setDoctorId(doctor.doctor().getId());
      oldVisit.setDate(yesterday);
      oldVisit.setQueueNumber(1);
      oldVisit.setSource(VisitSource.ONLINE);
      oldVisit.setCheckinMethod(CheckinMethod.QR);
      oldVisit.setAppointmentId(old.getId());
      visits.saveAndFlush(oldVisit);

      var result = janitor.sweep(Instant.now());
      assertThat(result).isEqualTo(Map.of("noShow", 1L, "left", 1L));
      assertThat(List.of(status(late.getId()), status(stillOk.getId()), status(old.getId())))
          .containsExactly(AppointmentStatus.NO_SHOW, AppointmentStatus.CONFIRMED, AppointmentStatus.NO_SHOW);
      assertThat(visits.findById(oldVisit.getId()).orElseThrow().getStatus()).isEqualTo(VisitStatus.LEFT);
    }

    @Test
    @DisplayName("lịch hẹn còn trong khung check-in vẫn ở mục sắp tới")
    void upcomingWithinWindow() {
      var p = fx.createPatient();
      Appointment appt = book(p.patient().getId(), -10);
      var upcoming = api.get("/api/appointments/mine").auth(p.token()).expect(200).body();
      assertThat(AdminTest.texts(upcoming, "id")).containsExactly(appt.getId());
      long start = Instant.parse(upcoming.at("/0/schedule/startTime").asText()).toEpochMilli();
      assertThat(Instant.parse(upcoming.at("/0/checkinClosesAt").asText()).toEpochMilli() - start).isEqualTo(15 * 60_000L);
      assertThat(start - Instant.parse(upcoming.at("/0/checkinOpensAt").asText()).toEpochMilli()).isEqualTo(30 * 60_000L);
    }

    @Test
    @DisplayName("không đến 3 lần trong 30 ngày thì bị khóa đặt lịch online 14 ngày")
    void lockAfterThreeNoShows() {
      var p = fx.createPatient();
      LocalDate today = VnTime.today(Instant.now());
      for (int daysAgo : List.of(1, 5)) book(p.patient().getId(), -daysAgo * DAY_MIN, today.minusDays(daysAgo), AppointmentStatus.NO_SHOW);

      var warn = api.get("/api/appointments/standing").auth(p.token()).expect(200).body();
      assertThat(warn.get("recentNoShows").asInt()).isEqualTo(2);
      assertThat(warn.get("limit").asInt()).isEqualTo(3);
      assertThat(warn.get("windowDays").asInt()).isEqualTo(30);
      assertThat(warn.get("lockedUntil").isNull()).isTrue();

      book(p.patient().getId(), -10 * DAY_MIN, today.minusDays(10), AppointmentStatus.NO_SHOW);
      var locked = api.get("/api/appointments/standing").auth(p.token()).expect(200).body();
      assertThat(locked.get("lockedUntil").asText()).isEqualTo(today.plusDays(13).toString());

      Instant start = Instant.now().plusSeconds(DAY_MIN * MIN);
      Schedule slot = new Schedule();
      slot.setDoctorId(doctor.doctor().getId());
      slot.setDate(VnTime.today(start));
      slot.setStartTime(start);
      slot.setEndTime(start.plusSeconds(15 * MIN));
      schedules.saveAndFlush(slot);
      var res = api.post("/api/appointments").auth(p.token()).send(Map.of("scheduleId", slot.getId())).expect(403);
      assertThat(res.body().get("message").asText()).containsPattern("không đến khám 3 lần trong 30 ngày.*lấy số trực tiếp");
    }
  }
}
