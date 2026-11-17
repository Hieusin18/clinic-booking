package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.Schedule;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Lịch khám và đặt lịch")
class BookingTest extends IntegrationTest {
  Fixtures.Login doctor;

  @BeforeEach
  void createDoctor() {
    doctor = fx.createDoctor();
  }

  /** Bác sĩ mở ca sáng ngày mai 8:00–9:00, mỗi lượt 15 phút → 4 khung giờ. */
  List<JsonNode> openTomorrow() {
    api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "08:00", "end", "09:00", "slotMinutes", 15)).expect(201);
    List<JsonNode> out = new ArrayList<>();
    api.get("/api/doctors/" + doctor.doctor().getId() + "/schedules?date=" + day(1)).expect(200).body().forEach(out::add);
    return out;
  }

  String book(Fixtures.Login patient, String scheduleId) {
    return api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", scheduleId)).expect(201).body().get("id").asText();
  }

  Schedule slot(LocalDate date, Instant start, Instant end, boolean booked) {
    Schedule s = new Schedule();
    s.setDoctorId(doctor.doctor().getId());
    s.setDate(date);
    s.setStartTime(start);
    s.setEndTime(end);
    s.setBooked(booked);
    return schedules.saveAndFlush(s);
  }

  @Nested
  @DisplayName("Khung giờ của bác sĩ")
  class Slots {
    @Test
    @DisplayName("tạo hàng loạt theo ca; tạo lại cùng ca thì bỏ qua, không trùng")
    void bulk() {
      var first = api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "08:00", "end", "09:00", "slotMinutes", 15))
          .expect(201).body();
      assertThat(first.get("created").asInt()).isEqualTo(4);
      assertThat(first.get("skipped").asInt()).isZero();
      var again = api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "08:00", "end", "09:30", "slotMinutes", 15))
          .expect(201).body();
      assertThat(again.get("created").asInt()).isEqualTo(2);
      assertThat(again.get("skipped").asInt()).isEqualTo(4);
      assertThat(schedules.count()).isEqualTo(6);
    }

    @Test
    @DisplayName("giờ hiển thị đúng theo giờ Việt Nam")
    void vietnamTime() {
      var slots = openTomorrow();
      assertThat(Instant.parse(slots.get(0).get("startTime").asText())).isEqualTo(Instant.parse(day(1) + "T01:00:00Z"));
    }

    @Test
    @DisplayName("không tạo được cho ngày đã qua hoặc giờ kết thúc trước giờ bắt đầu")
    void invalid() {
      api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(-1), "start", "08:00", "end", "09:00", "slotMinutes", 15)).expect(400);
      api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "10:00", "end", "09:00", "slotMinutes", 15)).expect(400);
    }

    @Test
    @DisplayName("chỉ bác sĩ tạo được khung giờ")
    void onlyDoctor() {
      var patient = fx.createPatient();
      api.post("/api/schedules/bulk").auth(patient.token()).send(Map.of("date", day(1), "start", "08:00", "end", "09:00", "slotMinutes", 15)).expect(403);
    }

    @Test
    @DisplayName("xóa được khung giờ trống, không xóa được khung giờ đã có người đặt")
    void remove() {
      var slots = openTomorrow();
      var patient = fx.createPatient();
      book(patient, slots.get(0).get("id").asText());
      var res = api.delete("/api/schedules/" + slots.get(0).get("id").asText()).auth(doctor.token()).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Khung giờ đã có người đặt, không xóa được");
      api.delete("/api/schedules/" + slots.get(1).get("id").asText()).auth(doctor.token()).expect(204);
    }

    @Test
    @DisplayName("bác sĩ không xóa được khung giờ của bác sĩ khác")
    void otherDoctor() {
      var slots = openTomorrow();
      var other = fx.createDoctor();
      api.delete("/api/schedules/" + slots.get(0).get("id").asText()).auth(other.token()).expect(404);
    }

    @Test
    @DisplayName("lịch làm việc của bác sĩ hiện tên bệnh nhân đã đặt")
    void mine() {
      var slots = openTomorrow();
      var patient = fx.createPatient();
      api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", slots.get(0).get("id").asText(), "reason", "Đau họng")).expect(201);
      var res = api.get("/api/schedules/mine?from=" + day(1) + "&to=" + day(1)).auth(doctor.token()).expect(200).body();
      assertThat(res).hasSize(4);
      assertThat(res.at("/0/appointments/0/reason").asText()).isEqualTo("Đau họng");
      assertThat(res.at("/0/appointments/0/patient/fullName").asText()).isEqualTo(patient.patient().getFullName());
    }
  }

  @Nested
  @DisplayName("Đặt lịch")
  class Book {
    @Test
    @DisplayName("đặt thành công thì khung giờ biến mất khỏi danh sách trống")
    void success() {
      var slots = openTomorrow();
      String a = slots.get(0).get("id").asText();
      var patient = fx.createPatient();
      var res = api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", a, "reason", "Sốt")).expect(201).body();
      assertThat(res.get("status").asText()).isEqualTo("CONFIRMED");
      assertThat(res.get("reason").asText()).isEqualTo("Sốt");
      assertThat(res.at("/schedule/id").asText()).isEqualTo(a);
      assertThat(res.at("/schedule/doctor/id").asText()).isEqualTo(doctor.doctor().getId());
      var left = api.get("/api/doctors/" + doctor.doctor().getId() + "/schedules?date=" + day(1)).expect(200).body();
      assertThat(AdminTest.texts(left, "id")).doesNotContain(a);
    }

    @Test
    @DisplayName("10 bệnh nhân cùng đặt một khung giờ đồng thời: đúng 1 người thành công, 9 người nhận 409")
    void concurrent() {
      var slots = openTomorrow();
      String a = slots.get(0).get("id").asText();
      List<Fixtures.Login> list = new ArrayList<>();
      for (int i = 0; i < 10; i++) list.add(fx.createPatient());
      List<CompletableFuture<Integer>> calls = list.stream()
          .map(p -> CompletableFuture.supplyAsync(() -> api.post("/api/appointments").auth(p.token()).send(Map.of("scheduleId", a)).call().status()))
          .toList();
      List<Integer> codes = calls.stream().map(CompletableFuture::join).toList();
      assertThat(codes.stream().filter(c -> c == 201)).hasSize(1);
      assertThat(codes.stream().filter(c -> c == 409)).hasSize(9);
      assertThat(count("Appointment", "\"scheduleId\" = ?", a)).isEqualTo(1);
    }

    @Test
    @DisplayName("không đặt được hai lịch với cùng bác sĩ trong một ngày")
    void sameDay() {
      var slots = openTomorrow();
      var patient = fx.createPatient();
      book(patient, slots.get(0).get("id").asText());
      var res = api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", slots.get(1).get("id").asText())).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Bạn đã có lịch với bác sĩ này trong ngày");
    }

    @Test
    @DisplayName("không đặt được khung giờ đã qua")
    void past() {
      Schedule past = slot(LocalDate.parse(day(0)), Instant.now().minusSeconds(3600), Instant.now().minusSeconds(2700), false);
      var patient = fx.createPatient();
      api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", past.getId())).expect(409);
    }

    @Test
    @DisplayName("lễ tân không đặt lịch qua API của bệnh nhân")
    void receptionistForbidden() {
      var slots = openTomorrow();
      var receptionist = fx.createUser(Role.RECEPTIONIST);
      api.post("/api/appointments").auth(receptionist.token()).send(Map.of("scheduleId", slots.get(0).get("id").asText())).expect(403);
    }
  }

  @Nested
  @DisplayName("Hủy lịch và lịch sử")
  class Cancel {
    @Test
    @DisplayName("hủy trước giờ khám thì khung giờ mở lại cho người khác đặt")
    void reopen() {
      var slots = openTomorrow();
      String a = slots.get(0).get("id").asText();
      var p1 = fx.createPatient();
      var p2 = fx.createPatient();
      String booked = book(p1, a);
      var cancelled = api.patch("/api/appointments/" + booked + "/cancel").auth(p1.token()).expect(200).body();
      assertThat(cancelled.get("status").asText()).isEqualTo("CANCELLED");
      book(p2, a);
    }

    @Test
    @DisplayName("không hủy được lịch đã qua giờ khám")
    void pastAppointment() {
      var patient = fx.createPatient();
      Schedule past = slot(LocalDate.parse(day(-1)), Instant.now().minusSeconds(86_400), Instant.now().minusSeconds(86_000), true);
      Appointment appt = new Appointment();
      appt.setPatientId(patient.patient().getId());
      appt.setScheduleId(past.getId());
      appt.setStatus(AppointmentStatus.CONFIRMED);
      appointments.saveAndFlush(appt);
      var res = api.patch("/api/appointments/" + appt.getId() + "/cancel").auth(patient.token()).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Không hủy được lịch đã qua giờ khám");
    }

    @Test
    @DisplayName("bệnh nhân chỉ thấy và hủy được lịch của chính mình")
    void ownOnly() {
      var slots = openTomorrow();
      var p1 = fx.createPatient();
      var p2 = fx.createPatient();
      String booked = book(p1, slots.get(0).get("id").asText());
      assertThat(api.get("/api/appointments/mine").auth(p1.token()).expect(200).body()).hasSize(1);
      assertThat(api.get("/api/appointments/mine").auth(p2.token()).expect(200).body()).isEmpty();
      api.patch("/api/appointments/" + booked + "/cancel").auth(p2.token()).expect(404);
    }

    @Test
    @DisplayName("lịch đã hủy chuyển sang mục đã qua")
    void cancelledIsPast() {
      var slots = openTomorrow();
      var patient = fx.createPatient();
      String booked = book(patient, slots.get(0).get("id").asText());
      api.patch("/api/appointments/" + booked + "/cancel").auth(patient.token()).expect(200);
      assertThat(api.get("/api/appointments/mine").auth(patient.token()).expect(200).body()).isEmpty();
      var past = api.get("/api/appointments/mine?when=past").auth(patient.token()).expect(200).body();
      assertThat(past.at("/0/status").asText()).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("lễ tân xem được lịch hẹn theo ngày")
    void byDay() {
      var slots = openTomorrow();
      var patient = fx.createPatient();
      book(patient, slots.get(0).get("id").asText());
      var receptionist = fx.createUser(Role.RECEPTIONIST);
      var res = api.get("/api/appointments?date=" + day(1)).auth(receptionist.token()).expect(200).body();
      assertThat(res).hasSize(1);
      assertThat(res.at("/0/patient/fullName").asText()).isEqualTo(patient.patient().getFullName());
    }
  }
}
