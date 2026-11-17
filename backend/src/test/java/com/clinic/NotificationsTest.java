package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.Notification;
import com.clinic.entity.Schedule;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.NotificationType;
import com.clinic.entity.enums.Role;
import com.clinic.entity.enums.VisitSource;
import com.clinic.repository.NotificationRepository;
import com.clinic.repository.PushTokenRepository;
import com.clinic.service.AppointmentReminder;
import com.clinic.service.ExpoPushClient;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import io.socket.client.IO;
import io.socket.client.Socket;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;
import org.json.JSONObject;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Thông báo cho bệnh nhân và nhắc lịch")
class NotificationsTest extends IntegrationTest {
  static final Duration MINUTE = Duration.ofMinutes(1);
  static final Duration HOUR = Duration.ofHours(1);
  static final ObjectMapper JSON = new ObjectMapper();

  /** Máy chủ Expo Push giả: ghi lại tin được gửi, trả DeviceNotRegistered cho token "chết". */
  static HttpServer expo;
  static final List<JsonNode> pushed = Collections.synchronizedList(new ArrayList<>());

  @Autowired
  ExpoPushClient expoClient;
  @Autowired
  NotificationRepository notificationRepo;
  @Autowired
  PushTokenRepository pushTokens;
  @Autowired
  AppointmentReminder reminder;

  String originalEndpoint;
  Fixtures.Login doctor;
  Fixtures.Login patient;
  String reception;

  @BeforeAll
  static void startExpo() throws IOException {
    expo = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    expo.createContext("/push", ex -> {
      JsonNode msgs = JSON.readTree(ex.getRequestBody());
      List<Object> data = new ArrayList<>();
      for (JsonNode m : msgs) {
        pushed.add(m);
        data.add(m.get("to").asText().contains("dead") ? Map.of("status", "error", "details", Map.of("error", "DeviceNotRegistered"))
            : Map.of("status", "ok", "id", "x"));
      }
      byte[] out = JSON.writeValueAsBytes(Map.of("data", data));
      ex.getResponseHeaders().add("Content-Type", "application/json");
      ex.sendResponseHeaders(200, out.length);
      ex.getResponseBody().write(out);
      ex.close();
    });
    expo.start();
  }

  @AfterAll
  static void stopExpo() {
    expo.stop(0);
  }

  @BeforeEach
  void setUp() {
    originalEndpoint = expoClient.getEndpoint();
    expoClient.setEndpoint("http://127.0.0.1:" + expo.getAddress().getPort() + "/push");
    pushed.clear();
    doctor = fx.createDoctor();
    Doctor d = doctors.findById(doctor.doctor().getId()).orElseThrow();
    d.setRoom("Phòng 2");
    doctors.saveAndFlush(d);
    patient = fx.createPatient();
    reception = fx.createUser(Role.RECEPTIONIST).token();
  }

  @AfterEach
  void restore() {
    expoClient.setEndpoint(originalEndpoint);
  }

  static void until(BooleanSupplier check) {
    for (int i = 0; i < 150 && !check.getAsBoolean(); i++) sleep(20);
    assertThat(check.getAsBoolean()).isTrue();
  }

  static void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  JsonNode inbox(String token) {
    return api.get("/api/notifications/mine").auth(token).expect(200).body();
  }

  JsonNode inbox() {
    return inbox(patient.token());
  }

  /** Thông báo được gửi sau khi thao tác chính trả về: chờ tới khi hộp thư thỏa điều kiện. */
  JsonNode inboxUntil(Predicate<JsonNode> check) {
    JsonNode box = inbox();
    for (int i = 0; i < 150 && !check.test(box); i++) {
      sleep(20);
      box = inbox();
    }
    assertThat(check.test(box)).as("hộp thư: %s", box).isTrue();
    return box;
  }

  static String firstType(JsonNode box) {
    return box.at("/items/0/type").asText("");
  }

  String takeTicket() {
    return api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201).body().get("id").asText();
  }

  @Test
  @DisplayName("bác sĩ gọi số: thông báo vào hộp thư, báo qua WebSocket và đẩy về các máy đã đăng ký")
  void called() throws Exception {
    api.post("/api/notifications/push-token").auth(patient.token()).send(Map.of("token", "ExponentPushToken[may-1]", "platform", "ios")).expect(200);
    api.post("/api/notifications/push-token").auth(patient.token()).send(Map.of("token", "ExponentPushToken[dead]", "platform", "android")).expect(200);
    IO.Options opts = IO.Options.builder().setPath("/api/socket.io").setAuth(Map.of("token", patient.token())).setTransports(new String[] {"websocket"})
        .setReconnection(false).build();
    Socket socket = IO.socket(URI.create("http://127.0.0.1:" + System.getProperty("SOCKET_PORT")), opts);
    List<JSONObject> live = Collections.synchronizedList(new ArrayList<>());
    socket.on("notification:new", args -> live.add((JSONObject) args[0]));
    CountDownLatch connected = new CountDownLatch(1);
    socket.once(Socket.EVENT_CONNECT, args -> connected.countDown());
    socket.connect();
    assertThat(connected.await(5, TimeUnit.SECONDS)).as("kết nối Socket.IO").isTrue();

    try {
      String visitId = takeTicket();
      api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
      until(() -> pushed.size() == 2);
      until(() -> live.size() == 1);

      JsonNode box = inbox();
      assertThat(box.get("unread").asInt()).isEqualTo(1);
      JsonNode n = box.at("/items/0");
      assertThat(n.get("type").asText()).isEqualTo("CALLED");
      assertThat(n.get("title").asText()).isEqualTo("Đến lượt bạn: số B01");
      assertThat(n.get("body").asText()).isEqualTo("Mời bạn vào Phòng 2.");
      assertThat(n.get("url").asText()).isEqualTo("/ticket");
      assertThat(n.get("readAt").isNull()).isTrue();
      assertThat(live.get(0).getString("id")).isEqualTo(n.get("id").asText());
      assertThat(live.get(0).getString("title")).isEqualTo("Đến lượt bạn: số B01");
      JsonNode first = pushed.stream().filter(m -> m.get("to").asText().equals("ExponentPushToken[may-1]")).findFirst().orElseThrow();
      assertThat(first.get("title").asText()).isEqualTo("Đến lượt bạn: số B01");
      assertThat(first.at("/data/url").asText()).isEqualTo("/ticket");
      assertThat(first.at("/data/type").asText()).isEqualTo("CALLED");
      // Token của máy đã gỡ app bị xóa
      until(() -> pushTokens.count() == 1);
      assertThat(pushTokens.findAll().get(0).getToken()).isEqualTo("ExponentPushToken[may-1]");

      api.post("/api/queue/" + visitId + "/recall").auth(doctor.token()).expect(200);
      until(() -> pushed.size() == 3);
      assertThat(inboxUntil(b -> b.get("items").size() == 2).at("/items/0/title").asText()).isEqualTo("Bác sĩ đang gọi lại số B01");
    } finally {
      socket.disconnect();
      socket.close();
    }
  }

  @Test
  @DisplayName("có kết quả cận lâm sàng (quay lại) và khám xong nhận kết quả online đều được báo")
  void results() {
    // Quay lại đọc kết quả
    String v1 = takeTicket();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + v1 + "/record").auth(doctor.token()).send(Map.of("symptoms", "Ho", "diagnosis", "Viêm phổi?")).expect(200);
    String o1 = api.post("/api/visits/" + v1 + "/lab-orders").auth(doctor.token()).send(Map.of("name", "X-quang ngực")).expect(201).body().get("id").asText();
    api.post("/api/visits/" + v1 + "/send-for-tests").auth(doctor.token()).send(Map.of("mode", "RETURN")).expect(200);
    api.patch("/api/lab-orders/" + o1).auth(doctor.token()).send(Map.of("resultText", "Bình thường", "done", true)).expect(200);
    api.post("/api/visits/" + v1 + "/results-ready").auth(doctor.token()).expect(200);
    JsonNode box = inboxUntil(b -> firstType(b).equals("RESULTS_READY"));
    assertThat(box.at("/items/0/title").asText()).isEqualTo("Đã có kết quả cận lâm sàng");
    assertThat(box.at("/items/0/url").asText()).isEqualTo("/ticket");
    assertThat(box.at("/items/0/body").asText()).contains("quay lại Phòng 2");

    // Gọi vào đọc kết quả rồi hoàn tất: báo đã lưu bệnh án
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.post("/api/visits/" + v1 + "/complete").auth(doctor.token()).expect(200);
    box = inboxUntil(b -> firstType(b).equals("VISIT_DONE"));
    assertThat(box.at("/items/0/title").asText()).isEqualTo("Đã lưu bệnh án lần khám");
    assertThat(box.at("/items/0/url").asText()).isEqualTo("/visit/" + v1);

    // Nhận kết quả online: về nhà, bác sĩ trả kết quả và hoàn tất
    String v2 = takeTicket();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + v2 + "/record").auth(doctor.token()).send(Map.of("symptoms", "Mệt", "diagnosis", "Gan nhiễm mỡ?")).expect(200);
    String o2 = api.post("/api/visits/" + v2 + "/lab-orders").auth(doctor.token()).send(Map.of("name", "Siêu âm bụng")).expect(201).body().get("id").asText();
    api.post("/api/visits/" + v2 + "/send-for-tests").auth(doctor.token()).send(Map.of("mode", "ONLINE")).expect(200);
    api.patch("/api/lab-orders/" + o2).auth(doctor.token()).send(Map.of("resultText", "Gan nhiễm mỡ độ I", "done", true)).expect(200);
    api.post("/api/visits/" + v2 + "/complete").auth(doctor.token()).expect(200);
    box = inboxUntil(b -> b.at("/items/0/visitId").asText("").equals(v2) && firstType(b).equals("VISIT_DONE"));
    assertThat(box.at("/items/0/title").asText()).isEqualTo("Đã có kết quả khám");
    assertThat(box.at("/items/0/url").asText()).isEqualTo("/visit/" + v2);
    assertThat(box.at("/items/0/body").asText()).contains("kết quả cận lâm sàng, kết luận và đơn thuốc");
  }

  Notification mk(String userId, NotificationType type, String visitId) {
    Notification n = new Notification();
    n.setUserId(userId);
    n.setType(type);
    n.setTitle("t");
    n.setBody("b");
    n.setVisitId(visitId);
    return notificationRepo.saveAndFlush(n);
  }

  @Test
  @DisplayName("đánh dấu đã đọc theo thông báo, theo lượt khám hoặc tất cả; không đụng tới thông báo của người khác")
  void markRead() {
    var other = fx.createPatient();
    Notification a = mk(patient.user().getId(), NotificationType.VISIT_DONE, "v-a");
    mk(patient.user().getId(), NotificationType.CALLED, "v-b");
    mk(patient.user().getId(), NotificationType.VISIT_DONE, "v-b");
    mk(patient.user().getId(), NotificationType.VISIT_DONE, "v-b");
    Notification theirs = mk(other.user().getId(), NotificationType.VISIT_DONE, null);

    assertThat(api.post("/api/notifications/read").auth(patient.token()).send(Map.of()).expect(400).body().get("message").asText()).contains("Chọn thông báo");
    assertThat(api.post("/api/notifications/read").auth(patient.token()).send(Map.of("ids", List.of(a.getId(), theirs.getId()))).expect(200).body())
        .isEqualTo(JSON.valueToTree(Map.of("unread", 3)));
    // Mở phiếu số: chỉ tin gọi số của lượt đó
    api.post("/api/notifications/read").auth(patient.token()).send(Map.of("visitId", "v-b", "types", List.of("NOPE"))).expect(400);
    assertThat(api.post("/api/notifications/read").auth(patient.token()).send(Map.of("visitId", "v-b", "types", List.of("CALLED"))).expect(200).body())
        .isEqualTo(JSON.valueToTree(Map.of("unread", 2)));
    assertThat(api.post("/api/notifications/read").auth(patient.token()).send(Map.of("visitId", "v-b")).expect(200).body())
        .isEqualTo(JSON.valueToTree(Map.of("unread", 0)));
    assertThat(inbox(other.token()).get("unread").asInt()).isEqualTo(1);
    assertThat(api.post("/api/notifications/read").auth(other.token()).send(Map.of("all", true)).expect(200).body())
        .isEqualTo(JSON.valueToTree(Map.of("unread", 0)));
    // Nhân viên không có hộp thư
    api.get("/api/notifications/mine").auth(doctor.token()).expect(403);
  }

  @Test
  @DisplayName("token đẩy: kiểm tra định dạng, chuyển sang tài khoản mới khi máy đổi người dùng, xóa khi đăng xuất")
  void pushTokens() {
    api.post("/api/notifications/push-token").auth(patient.token()).send(Map.of("token", "abc", "platform", "ios")).expect(400);
    api.post("/api/notifications/push-token").auth(patient.token()).send(Map.of("token", "ExpoPushToken[x]", "platform", "web")).expect(400);
    api.post("/api/notifications/push-token").auth(doctor.token()).send(Map.of("token", "ExpoPushToken[x]", "platform", "ios")).expect(403);
    api.post("/api/notifications/push-token").auth(patient.token()).send(Map.of("token", "ExpoPushToken[x]", "platform", "ios")).expect(200);
    var other = fx.createPatient();
    api.post("/api/notifications/push-token").auth(other.token()).send(Map.of("token", "ExpoPushToken[x]", "platform", "ios")).expect(200);
    assertThat(pushTokens.findAll()).extracting(t -> t.getUserId()).containsExactly(other.user().getId());
    // Người cũ không xóa được token đã chuyển sang người khác
    api.post("/api/notifications/push-token/remove").auth(patient.token()).send(Map.of("token", "ExpoPushToken[x]")).expect(200);
    assertThat(pushTokens.count()).isEqualTo(1);
    api.post("/api/notifications/push-token/remove").auth(other.token()).send(Map.of("token", "ExpoPushToken[x]")).expect(200);
    assertThat(pushTokens.count()).isZero();
  }

  @Test
  @DisplayName("nhắc lịch trước một ngày và trước một giờ, mỗi mốc một lần; không nhắc lịch đặt sát giờ, đã hủy hoặc đã check-in")
  void reminders() {
    Instant start = Instant.parse("2026-11-20T02:00:00Z"); // 09:00 giờ Việt Nam
    Instant longAgo = Instant.parse("2026-11-10T00:00:00Z");
    Appointment early = book(start, longAgo, AppointmentStatus.PENDING);
    // Đặt 3 giờ trước giờ hẹn: không nhắc trước một ngày, vẫn nhắc trước một giờ
    Appointment late = book(start, start.minus(HOUR.multipliedBy(3)), AppointmentStatus.PENDING);
    book(start, longAgo, AppointmentStatus.CANCELLED);
    // Đã check-in (có phiếu khám) thì thôi nhắc
    Appointment arrived = book(start, longAgo, AppointmentStatus.PENDING);
    Schedule sched = schedules.findById(arrived.getScheduleId()).orElseThrow();
    Visit v = new Visit();
    v.setPatientId(patient.patient().getId());
    v.setDoctorId(sched.getDoctorId());
    v.setDate(LocalDate.parse("2026-11-20"));
    v.setQueueNumber(1);
    v.setSource(VisitSource.ONLINE);
    v.setCheckinMethod(CheckinMethod.QR);
    v.setAppointmentId(arrived.getId());
    visits.saveAndFlush(v);

    // Còn hơn 24 giờ: chưa nhắc
    assertThat(reminder.sweep(start.minus(HOUR.multipliedBy(25)))).isZero();
    // Còn 23 giờ: nhắc trước một ngày (chỉ lịch đặt sớm), chạy lại không gửi trùng
    assertThat(reminder.sweep(start.minus(HOUR.multipliedBy(23)))).isEqualTo(1);
    assertThat(reminder.sweep(start.minus(HOUR.multipliedBy(22)))).isZero();
    JsonNode box = inboxUntil(b -> b.get("items").size() >= 1);
    assertThat(box.at("/items/0/type").asText()).isEqualTo("APPOINTMENT_REMINDER");
    assertThat(box.at("/items/0/title").asText()).isEqualTo("Nhắc lịch khám ngày mai lúc 09:00");
    assertThat(box.at("/items/0/url").asText()).isEqualTo("/appointments");
    assertThat(box.at("/items/0/body").asText())
        .matches("^09:00 với bác sĩ .+ \\(Phòng 2\\)\\. Đến quầy quét mã QR để check-in từ 08:30 đến 09:15; quá giờ lịch hẹn sẽ bị hủy\\.$");

    // Còn 45 phút: nhắc trước một giờ cho cả hai lịch còn hiệu lực
    assertThat(reminder.sweep(start.minus(MINUTE.multipliedBy(45)))).isEqualTo(2);
    assertThat(reminder.sweep(start.minus(MINUTE.multipliedBy(30)))).isZero();
    box = inboxUntil(b -> b.get("items").size() >= 3);
    assertThat(List.of(box.at("/items/0/title").asText(), box.at("/items/1/title").asText()))
        .containsExactly("Còn 45 phút nữa tới giờ khám", "Còn 45 phút nữa tới giờ khám");
    assertThat(box.get("unread").asInt()).isEqualTo(3);
    assertThat(appointments.findById(late.getId()).orElseThrow().getRemindedDayAt()).isNull();
    assertThat(appointments.findById(early.getId()).orElseThrow().getRemindedHourAt()).isNotNull();
  }

  Appointment book(Instant start, Instant createdAt, AppointmentStatus status) {
    var d = fx.createDoctor();
    Doctor doc = doctors.findById(d.doctor().getId()).orElseThrow();
    doc.setRoom("Phòng 2");
    doctors.saveAndFlush(doc);
    Schedule s = new Schedule();
    s.setDoctorId(doc.getId());
    s.setDate(LocalDate.parse("2026-11-20"));
    s.setStartTime(start);
    s.setEndTime(start.plus(MINUTE.multipliedBy(30)));
    s.setBooked(true);
    schedules.saveAndFlush(s);
    Appointment a = new Appointment();
    a.setPatientId(patient.patient().getId());
    a.setScheduleId(s.getId());
    a.setCreatedAt(createdAt);
    a.setStatus(status);
    return appointments.saveAndFlush(a);
  }

  @Test
  @DisplayName("ghi ngày nhắc theo giờ Việt Nam")
  void dayWord() {
    Instant start = Instant.parse("2026-11-20T02:00:00Z");
    assertThat(AppointmentReminder.dayWord(start, Instant.parse("2026-11-19T03:00:00Z"))).isEqualTo("ngày mai");
    assertThat(AppointmentReminder.dayWord(start, Instant.parse("2026-11-20T00:00:00Z"))).isEqualTo("hôm nay");
    assertThat(AppointmentReminder.dayWord(start, Instant.parse("2026-11-17T03:00:00Z"))).isEqualTo("ngày 20/11");
  }
}
