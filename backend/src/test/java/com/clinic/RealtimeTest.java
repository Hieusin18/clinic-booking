package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Doctor;
import com.clinic.entity.enums.Role;
import com.clinic.support.IntegrationTest;
import com.clinic.support.Sockets;
import io.socket.client.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Cập nhật tức thì qua WebSocket và loa gọi số")
class RealtimeTest extends IntegrationTest {
  final List<Sockets.Open> opened = new ArrayList<>();

  record Event(String name, JSONObject payload) {}

  @AfterEach
  void closeAll() {
    opened.forEach(Sockets.Open::close);
    opened.clear();
  }

  /** Kết nối như web/app rồi gom mọi sự kiện socket nhận được. */
  List<Event> record(String token) {
    List<Event> got = Collections.synchronizedList(new ArrayList<>());
    Sockets.Open o = Sockets.open(token);
    o.socket().onAnyIncoming(args -> got.add(new Event((String) args[0], args.length > 1 && args[1] instanceof JSONObject j ? j : new JSONObject())));
    opened.add(o);
    return got;
  }

  static void until(BooleanSupplier check) {
    for (int i = 0; i < 100 && !check.getAsBoolean(); i++) NotificationsTest.sleep(20);
    assertThat(check.getAsBoolean()).isTrue();
  }

  static boolean has(List<Event> events, String name) {
    synchronized (events) {
      return events.stream().anyMatch(e -> e.name().equals(name));
    }
  }

  static JSONObject first(List<Event> events, String name) {
    synchronized (events) {
      return events.stream().filter(e -> e.name().equals(name)).findFirst().orElseThrow().payload();
    }
  }

  @Test
  @DisplayName("không có token hợp lệ thì bị ngắt kết nối")
  void invalidToken() {
    Socket s = Sockets.create("sai");
    var reason = new java.util.concurrent.CompletableFuture<String>();
    s.on(Socket.EVENT_DISCONNECT, a -> reason.complete(String.valueOf(a[0])));
    s.connect();
    try {
      assertThat(reason.get(5, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo("io server disconnect");
    } catch (Exception e) {
      throw new AssertionError(e);
    } finally {
      s.close();
    }
  }

  @Test
  @DisplayName("lấy số → nhân viên nhận queue:changed; gọi số → loa (queue:called kèm phòng) và app bệnh nhân (visit:called)")
  void events() {
    var doctor = fx.createDoctor();
    Doctor d = doctors.findById(doctor.doctor().getId()).orElseThrow();
    d.setRoom("Phòng 2");
    doctors.saveAndFlush(d);
    var reception = fx.createUser(Role.RECEPTIONIST);
    var patient = fx.createPatient();
    var other = fx.createPatient();

    List<Event> staff = record(reception.token());
    List<Event> mine = record(patient.token());
    List<Event> notMine = record(other.token());

    String ticket = api.post("/api/queue/tickets").auth(reception.token())
        .send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId())).expect(201).body().get("id").asText();
    until(() -> has(staff, "queue:changed"));
    until(() -> {
      synchronized (mine) {
        return mine.stream().anyMatch(e -> e.name().equals("visit:changed") && "WAITING".equals(e.payload().optString("status")));
      }
    });

    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    until(() -> has(staff, "queue:called"));
    JSONObject called = first(staff, "queue:called");
    assertThat(called.optString("visitId")).isEqualTo(ticket);
    assertThat(called.optString("label")).isEqualTo("B01");
    assertThat(called.optString("room")).isEqualTo("Phòng 2");
    assertThat(called.opt("doctorFullName")).isInstanceOf(String.class);
    assertThat(called.optBoolean("recall", true)).isFalse();
    until(() -> has(mine, "visit:called"));
    JSONObject visitCalled = first(mine, "visit:called");
    assertThat(visitCalled.optString("label")).isEqualTo("B01");
    assertThat(visitCalled.optString("room")).isEqualTo("Phòng 2");

    // Bệnh nhân khác không nhận sự kiện của người khác; bệnh nhân không nhận sự kiện dành cho nhân viên
    assertThat(notMine).isEmpty();
    synchronized (mine) {
      assertThat(mine).noneMatch(e -> e.name().startsWith("queue:"));
    }
  }

  @Test
  @DisplayName("bác sĩ gọi lại số đang khám: loa đọc lại; số không đang khám thì không gọi lại được")
  void recall() {
    var doctor = fx.createDoctor();
    var reception = fx.createUser(Role.RECEPTIONIST);
    var patient = fx.createPatient();
    List<Event> staff = record(reception.token());
    String ticket = api.post("/api/queue/tickets").auth(reception.token())
        .send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId())).expect(201).body().get("id").asText();
    api.post("/api/queue/" + ticket + "/recall").auth(doctor.token()).expect(409);
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.post("/api/queue/" + ticket + "/recall").auth(doctor.token()).expect(200);
    until(() -> {
      synchronized (staff) {
        return staff.stream().anyMatch(e -> e.name().equals("queue:called") && e.payload().optBoolean("recall"));
      }
    });
    var someoneElse = fx.createDoctor();
    api.post("/api/queue/" + ticket + "/recall").auth(someoneElse.token()).expect(404);
  }

  @Test
  @DisplayName("admin đặt phòng khám cho bác sĩ; bệnh nhân thấy phòng trong hồ sơ bác sĩ")
  void room() {
    String admin = fx.createUser(Role.ADMIN).token();
    var doctor = fx.createDoctor();
    api.patch("/api/doctors/" + doctor.doctor().getId()).auth(admin).send(Map.of("room", "  Phòng 5 ")).expect(200);
    assertThat(api.get("/api/doctors/" + doctor.doctor().getId()).expect(200).body().get("room").asText()).isEqualTo("Phòng 5");
    api.patch("/api/doctors/" + doctor.doctor().getId()).auth(admin).send(Map.of("room", "")).expect(200);
    assertThat(api.get("/api/doctors/" + doctor.doctor().getId()).expect(200).body().get("room").isNull()).isTrue();
  }
}
