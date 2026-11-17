package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.clinic.dto.auth.LoginRequest;
import com.clinic.entity.PushToken;
import com.clinic.entity.Specialty;
import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.PushTokenRepository;
import com.clinic.repository.SpecialtyRepository;
import com.clinic.security.Passwords;
import com.clinic.service.AccountsService;
import com.clinic.service.AuthService;
import com.clinic.support.Api;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.support.Sockets;
import io.socket.client.Socket;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Bảo mật đăng nhập")
class LoginSecurityTest extends IntegrationTest {
  @Autowired
  AuthService auth;
  @Autowired
  AccountsService accounts;
  @Autowired
  PushTokenRepository pushTokenRepo;
  @Autowired
  SpecialtyRepository specialties;

  Api.Req login(String phone, String password) {
    return api.post("/api/auth/login").send(Map.of("phone", phone, "password", password));
  }

  List<String> pushTokens(String userId) {
    return pushTokenRepo.findAll().stream().filter(t -> t.getUserId().equals(userId)).map(PushToken::getToken).sorted().toList();
  }

  void addPush(String token, String push) {
    api.post("/api/notifications/push-token").auth(token).send(Map.of("token", push, "platform", "ios")).expect(200);
  }

  String loginToken(String phone) {
    return login(phone, Fixtures.PASSWORD).expect(200).body().get("accessToken").asText();
  }

  @Test
  @DisplayName("khóa tài khoản: token đang dùng hết hiệu lực ngay, cả WebSocket")
  void lockAccount() throws Exception {
    String admin = fx.createUser(Role.ADMIN).token();
    var doctor = fx.createDoctor();
    api.get("/api/auth/me").auth(doctor.token()).expect(200);
    api.patch("/api/doctors/" + doctor.doctor().getId()).auth(admin).send(Map.of("isActive", false)).expect(200);
    assertThat(api.get("/api/auth/me").auth(doctor.token()).expect(401).body().get("message").asText())
        .isEqualTo("Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên");

    Socket socket = Sockets.create(doctor.token());
    CompletableFuture<String> err = new CompletableFuture<>();
    socket.on("auth:error", a -> err.complete(((JSONObject) a[0]).optString("message")));
    socket.connect();
    try {
      assertThat(err.get(5, TimeUnit.SECONDS)).contains("không hợp lệ");
    } finally {
      socket.disconnect();
      socket.close();
    }
  }

  @Test
  @DisplayName("sai mật khẩu 5 lần thì tạm khóa 15 phút, kể cả nhập đúng; hết hạn khóa thì đăng nhập lại được")
  void lockAfterFailures() {
    User user = fx.createUser(Role.RECEPTIONIST).user();
    for (int i = 1; i < AuthService.MAX_FAILED_LOGINS; i++) {
      assertThat(login(user.getPhone(), "sai-mat-khau-1").expect(401).body().get("message").asText()).isEqualTo("Sai số điện thoại hoặc mật khẩu");
    }
    assertThat(login(user.getPhone(), "sai-mat-khau-1").expect(429).body().get("message").asText()).contains("Tài khoản tạm khóa 15 phút");
    assertThat(login(user.getPhone(), Fixtures.PASSWORD).expect(429).body().get("message").asText()).contains("thử lại sau 15 phút");

    // Hết thời gian khóa
    User u = users.findById(user.getId()).orElseThrow();
    u.setLockedUntil(Instant.now().minusSeconds(1));
    users.saveAndFlush(u);
    login(user.getPhone(), Fixtures.PASSWORD).expect(200);
    User after = users.findById(user.getId()).orElseThrow();
    assertThat(after.getFailedLogins()).isZero();
    assertThat(after.getLockedUntil()).isNull();
    assertThat(after.getLastLoginAt()).isNotNull();
  }

  @Test
  @DisplayName("bệnh nhân bị tạm khóa được chỉ tới \"Quên mật khẩu\", nhân viên được chỉ tới quản trị viên")
  void lockMessagePatient() {
    var patient = fx.createPatient();
    for (int i = 1; i < AuthService.MAX_FAILED_LOGINS; i++) login(patient.user().getPhone(), "sai-mat-khau-1").expect(401);
    String msg = login(patient.user().getPhone(), "sai-mat-khau-1").expect(429).body().get("message").asText();
    assertThat(msg).contains("Quên mật khẩu").doesNotContain("quản trị viên");
  }

  @Test
  @DisplayName("đăng nhập đúng thì xóa số lần sai trước đó")
  void resetFailures() {
    User user = fx.createUser(Role.RECEPTIONIST).user();
    login(user.getPhone(), "sai-mat-khau-1").expect(401);
    login(user.getPhone(), "sai-mat-khau-1").expect(401);
    login(user.getPhone(), Fixtures.PASSWORD).expect(200);
    assertThat(users.findById(user.getId()).orElseThrow().getFailedLogins()).isZero();
  }

  static int statusOf(Runnable r) {
    ApiException e = catchThrowableOfType(ApiException.class, r::run);
    assertThat(e).isNotNull();
    return e.getStatus().value();
  }

  @Test
  @DisplayName("một địa chỉ IP sai quá 30 lần (trên nhiều tài khoản) thì bị chặn")
  void ipLimit() {
    Instant now = Instant.parse("2026-11-08T08:00:00Z");
    for (int i = 0; i < AuthService.MAX_FAILED_PER_IP; i++) {
      String phone = "09" + String.format("%08d", i);
      assertThat(statusOf(() -> auth.login(new LoginRequest(phone, "x"), "203.0.113.9", now))).isEqualTo(401);
    }
    assertThat(statusOf(() -> auth.login(new LoginRequest("0911111111", "x"), "203.0.113.9", now))).isEqualTo(429);
    // IP khác không bị ảnh hưởng; hết 15 phút thì IP cũ thử lại được
    assertThat(statusOf(() -> auth.login(new LoginRequest("0911111111", "x"), "203.0.113.10", now))).isEqualTo(401);
    Instant later = now.plus(Duration.ofMinutes(AuthService.LOCK_MINUTES)).plusSeconds(1);
    assertThat(statusOf(() -> auth.login(new LoginRequest("0911111111", "x"), "203.0.113.9", later))).isEqualTo(401);
  }

  @Test
  @DisplayName("đổi mật khẩu: kiểm tra mật khẩu cũ và độ mạnh; máy khác bị đăng xuất, máy đang dùng nhận token mới")
  void changePassword() {
    var patient = fx.createPatient();
    String otherDevice = loginToken(patient.user().getPhone());
    java.util.function.Function<Map<String, Object>, Api.Req> change = body -> api.post("/api/auth/change-password").auth(patient.token()).send(body);

    assertThat(change.apply(Map.of("currentPassword", "sai", "newPassword", "hoaxuan2026")).expect(400).body().get("message").asText())
        .isEqualTo("Mật khẩu hiện tại không đúng");
    assertThat(change.apply(Map.of("currentPassword", Fixtures.PASSWORD, "newPassword", "abc")).expect(400).body().get("message").asText())
        .isEqualTo("Mật khẩu tối thiểu 8 ký tự");
    var ok = change.apply(Map.of("currentPassword", Fixtures.PASSWORD, "newPassword", "hoaxuan2026")).expect(200).body();
    assertThat(ok.at("/user/mustChangePassword").asBoolean()).isFalse();

    api.get("/api/auth/me").auth(otherDevice).expect(401);
    api.get("/api/auth/me").auth(patient.token()).expect(401);
    api.get("/api/auth/me").auth(ok.get("accessToken").asText()).expect(200);
    login(patient.user().getPhone(), Fixtures.PASSWORD).expect(401);
    login(patient.user().getPhone(), "hoaxuan2026").expect(200);
  }

  @Test
  @DisplayName("đổi mật khẩu: máy khác thôi nhận thông báo đẩy và bị ngắt realtime; máy đang dùng giữ thông báo, kết nối lại bằng token mới")
  void changePasswordDevices() {
    var patient = fx.createPatient();
    String other = loginToken(patient.user().getPhone());
    addPush(patient.token(), "ExpoPushToken[may-nay]");
    addPush(other, "ExpoPushToken[may-kia]");
    var here = Sockets.open(patient.token());
    var there = Sockets.open(other);
    try {
      var ok = api.post("/api/auth/change-password").auth(patient.token())
          .send(Map.of("currentPassword", Fixtures.PASSWORD, "newPassword", "hoaxuan2026", "pushToken", "ExpoPushToken[may-nay]")).expect(200).body();
      assertThat(pushTokens(patient.user().getId())).containsExactly("ExpoPushToken[may-nay]");
      assertThat(there.closedReason()).isEqualTo("io server disconnect");
      // Kết nối của máy này dùng token cũ cũng bị ngắt; kết nối lại bằng token mới thì được
      assertThat(here.closedReason()).isEqualTo("io server disconnect");
      var again = Sockets.open(ok.get("accessToken").asText());
      assertThat(again.socket().connected()).isTrue();
      again.close();
    } finally {
      here.close();
      there.close();
    }
  }

  @Test
  @DisplayName("đăng xuất mọi thiết bị")
  void logoutAll() {
    var doctor = fx.createDoctor();
    String second = loginToken(doctor.user().getPhone());
    api.post("/api/auth/logout-all").auth(doctor.token()).expect(200);
    api.get("/api/auth/me").auth(doctor.token()).expect(401);
    api.get("/api/auth/me").auth(second).expect(401);
  }

  @Test
  @DisplayName("đăng xuất mọi thiết bị (bệnh nhân): không máy nào còn nhận thông báo đẩy hay realtime")
  void logoutAllPatient() {
    var patient = fx.createPatient();
    String second = loginToken(patient.user().getPhone());
    addPush(patient.token(), "ExpoPushToken[a]");
    addPush(second, "ExpoPushToken[b]");
    var socket = Sockets.open(second);
    try {
      api.post("/api/auth/logout-all").auth(patient.token()).expect(200);
      assertThat(pushTokens(patient.user().getId())).isEmpty();
      assertThat(socket.closedReason()).isEqualTo("io server disconnect");
    } finally {
      socket.close();
    }
  }

  @Test
  @DisplayName("khóa tài khoản nhân viên đang mở: kết nối realtime bị ngắt ngay")
  void lockStaffSocket() {
    String admin = fx.createUser(Role.ADMIN).token();
    var reception = fx.createUser(Role.RECEPTIONIST);
    var socket = Sockets.open(reception.token());
    try {
      api.patch("/api/staff/receptionists/" + reception.user().getId()).auth(admin).send(Map.of("isActive", false)).expect(200);
      assertThat(socket.closedReason()).isEqualTo("io server disconnect");
    } finally {
      socket.close();
    }
  }

  @Test
  @DisplayName("admin đặt lại mật khẩu bác sĩ: mật khẩu tạm, phải đổi trước khi dùng hệ thống, máy cũ bị đăng xuất")
  void adminReset() {
    var admin = fx.createUser(Role.ADMIN);
    var doctor = fx.createDoctor();
    var patient = fx.createPatient();

    api.post("/api/users/" + doctor.user().getId() + "/reset-password").auth(doctor.token()).expect(403);
    api.post("/api/users/" + patient.user().getId() + "/reset-password").auth(admin.token()).expect(400);
    api.post("/api/users/" + admin.user().getId() + "/reset-password").auth(admin.token()).expect(400);
    String temp = api.post("/api/users/" + doctor.user().getId() + "/reset-password").auth(admin.token()).expect(200).body().get("temporaryPassword").asText();
    assertThat(temp).matches("^[A-Za-z2-9]{4}-[A-Za-z2-9]{5}$");

    api.get("/api/queue/mine").auth(doctor.token()).expect(401);
    var session = login(doctor.user().getPhone(), temp).expect(200).body();
    assertThat(session.at("/user/mustChangePassword").asBoolean()).isTrue();
    String t = session.get("accessToken").asText();
    // Chỉ xem được thông tin tài khoản và đổi mật khẩu
    api.get("/api/auth/me").auth(t).expect(200);
    assertThat(api.get("/api/doctors/me").auth(t).expect(403).body().get("code").asText()).isEqualTo("MUST_CHANGE_PASSWORD");

    var changed = api.post("/api/auth/change-password").auth(t).send(Map.of("currentPassword", temp, "newPassword", "binhminh2026")).expect(200).body();
    api.get("/api/doctors/me").auth(changed.get("accessToken").asText()).expect(200);
  }

  Specialty specialty(String name) {
    Specialty s = new Specialty();
    s.setName(name);
    return specialties.saveAndFlush(s);
  }

  @Test
  @DisplayName("tài khoản admin tạo mới phải đổi mật khẩu ở lần đăng nhập đầu")
  void newAccountMustChange() {
    String admin = fx.createUser(Role.ADMIN).token();
    Specialty s = specialty("Nhi khoa");
    api.post("/api/doctors").auth(admin).send(Map.of("fullName", "Lê Văn C", "phone", "0912345678", "password", "tam-12345", "specialtyId", s.getId()))
        .expect(201);
    assertThat(login("0912345678", "tam-12345").expect(200).body().at("/user/mustChangePassword").asBoolean()).isTrue();
  }

  @Test
  @DisplayName("mật khẩu ban đầu admin đặt cho bác sĩ / lễ tân theo cùng quy tắc (không còn cho 6 ký tự)")
  void staffPasswordRules() {
    String admin = fx.createUser(Role.ADMIN).token();
    Specialty s = specialty("Da liễu");
    java.util.function.Function<String, Api.Req> doctor = pw -> api.post("/api/doctors").auth(admin)
        .send(Map.of("fullName", "Lê Văn D", "phone", "0912345679", "password", pw, "specialtyId", s.getId()));
    assertThat(doctor.apply("123456").expect(400).body().get("message").asText()).isEqualTo("Mật khẩu tối thiểu 8 ký tự");
    assertThat(doctor.apply("abcdefgh").expect(400).body().get("message").asText()).isEqualTo("Mật khẩu cần có cả chữ và số");
    assertThat(doctor.apply("a0912345679").expect(400).body().get("message").asText()).isEqualTo("Mật khẩu không được chứa số điện thoại");
    java.util.function.Function<String, Api.Req> reception = pw -> api.post("/api/staff/receptionists").auth(admin)
        .send(Map.of("fullName", "Lễ Tân E", "phone", "0912345670", "password", pw));
    assertThat(reception.apply("letan1").expect(400).body().get("message").asText()).isEqualTo("Mật khẩu tối thiểu 8 ký tự");
    reception.apply("quaytiepdon1").expect(201);
  }

  @Test
  @DisplayName("lệnh trên máy chủ (admin quên mật khẩu) dùng chung cách cấp mật khẩu tạm")
  void cliReset() {
    var admin = fx.createUser(Role.ADMIN);
    Map<String, Object> r = accounts.issueTemporaryPassword(admin.user().getId());
    @SuppressWarnings("unchecked")
    Map<String, Object> user = (Map<String, Object>) r.get("user");
    assertThat(user.get("phone")).isEqualTo(admin.user().getPhone());
    assertThat(String.valueOf(user.get("role"))).isEqualTo("ADMIN");
    api.get("/api/auth/me").auth(admin.token()).expect(401);
    assertThat(login(admin.user().getPhone(), (String) r.get("temporaryPassword")).expect(200).body().at("/user/mustChangePassword").asBoolean()).isTrue();
  }

  @Test
  @DisplayName("quy tắc mật khẩu và mật khẩu tạm")
  void passwordRules() {
    assertThat(Passwords.problem("hoaxuan2026", null)).isNull();
    assertThat(Passwords.problem("Mùaxuân2026", null)).isNull();
    assertThat(Passwords.problem("a".repeat(80) + "1", null)).isEqualTo("Mật khẩu tối đa 72 ký tự");
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < 50; i++) {
      String t = Passwords.temporary();
      assertThat(Passwords.problem(t, null)).isNull();
      seen.add(t);
    }
    assertThat(seen).hasSize(50);
  }
}
