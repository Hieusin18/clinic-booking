package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Patient;
import com.clinic.entity.User;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.Role;
import com.clinic.support.IntegrationTest;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Tài khoản và phân quyền")
class AuthTest extends IntegrationTest {
  static Map<String, Object> register(Object... overrides) {
    Map<String, Object> m = new HashMap<>(Map.of("fullName", "Nguyễn Thị Hoa", "phone", "0987654321", "password", "xuanhoa2026",
        "dateOfBirth", "1998-03-20", "gender", "FEMALE"));
    for (int i = 0; i < overrides.length; i += 2) m.put((String) overrides[i], overrides[i + 1]);
    return m;
  }

  @Nested
  @DisplayName("Đăng ký")
  class Register {
    @Test
    @DisplayName("tạo tài khoản bệnh nhân kèm hồ sơ và trả về token")
    void createsPatient() {
      var res = api.post("/api/auth/register").send(register()).expect(201);
      assertThat(res.body().get("accessToken").isTextual()).isTrue();
      assertThat(res.body().at("/user/phone").asText()).isEqualTo("0987654321");
      assertThat(res.body().at("/user/role").asText()).isEqualTo("PATIENT");
      assertThat(res.body().get("user").has("passwordHash")).isFalse();
      Patient patient = patients.findByPhone("0987654321").orElseThrow();
      assertThat(patient.getUserId()).isEqualTo(res.body().at("/user/id").asText());
    }

    @Test
    @DisplayName("không lưu mật khẩu dạng chữ thường")
    void hashesPassword() {
      api.post("/api/auth/register").send(register()).expect(201);
      User user = users.findByPhone("0987654321").orElseThrow();
      assertThat(user.getPasswordHash()).doesNotContain("xuanhoa2026").matches("^\\$2[aby]\\$.*");
    }

    @Test
    @DisplayName("trả 409 khi SĐT đã có tài khoản")
    void duplicatePhone() {
      api.post("/api/auth/register").send(register()).expect(201);
      var res = api.post("/api/auth/register").send(register()).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Số điện thoại đã được đăng ký");
    }

    @Test
    @DisplayName("gắn tài khoản vào hồ sơ lễ tân đã tạo trước với cùng SĐT")
    void linksExistingRecord() {
      Patient walkIn = new Patient();
      walkIn.setFullName("Nguyễn Thị Hoa");
      walkIn.setPhone("0987654321");
      walkIn.setDateOfBirth(LocalDate.parse("1998-03-20"));
      walkIn.setGender(Gender.FEMALE);
      patients.saveAndFlush(walkIn);
      var res = api.post("/api/auth/register").send(register()).expect(201);
      assertThat(patients.findById(walkIn.getId()).orElseThrow().getUserId()).isEqualTo(res.body().at("/user/id").asText());
      assertThat(patients.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("trả 400 với SĐT sai định dạng")
    void badPhone() {
      var res = api.post("/api/auth/register").send(register("phone", "12345")).expect(400);
      assertThat(res.body().get("message").toString()).contains("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0");
    }

    @Test
    @DisplayName("từ chối mật khẩu yếu: ngắn, chỉ có chữ hoặc chỉ có số, quá phổ biến, chứa số điện thoại")
    void weakPasswords() {
      List<String[]> cases = List.of(
          new String[] {"ab12", "Mật khẩu tối thiểu 8 ký tự"},
          new String[] {"abcdefgh", "Mật khẩu cần có cả chữ và số"},
          new String[] {"12345678", "Mật khẩu cần có cả chữ và số"},
          new String[] {"Password1", "Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác"},
          new String[] {"a0987654321", "Mật khẩu không được chứa số điện thoại"});
      for (String[] c : cases) {
        var res = api.post("/api/auth/register").send(register("password", c[0])).expect(400);
        assertThat(res.body().get("message").asText()).isEqualTo(c[1]);
      }
      assertThat(users.count()).isZero();
    }
  }

  @Nested
  @DisplayName("Đăng nhập")
  class Login {
    @BeforeEach
    void registered() {
      api.post("/api/auth/register").send(register()).expect(201);
    }

    @Test
    @DisplayName("đúng mật khẩu trả về token, dùng được cho /auth/me")
    void loginAndMe() {
      var res = api.post("/api/auth/login").send(Map.of("phone", "0987654321", "password", "xuanhoa2026")).expect(200);
      var me = api.get("/api/auth/me").auth(res.body().get("accessToken").asText()).expect(200);
      assertThat(me.body().get("phone").asText()).isEqualTo("0987654321");
      assertThat(me.body().get("role").asText()).isEqualTo("PATIENT");
      assertThat(me.body().at("/patient/fullName").asText()).isEqualTo("Nguyễn Thị Hoa");
    }

    @Test
    @DisplayName("sai mật khẩu trả 401")
    void wrongPassword() {
      var res = api.post("/api/auth/login").send(Map.of("phone", "0987654321", "password", "sai-mat-khau")).expect(401);
      assertThat(res.body().get("message").asText()).isEqualTo("Sai số điện thoại hoặc mật khẩu");
    }

    @Test
    @DisplayName("tài khoản bị khóa không đăng nhập được")
    void lockedAccount() {
      User u = users.findByPhone("0987654321").orElseThrow();
      u.setActive(false);
      users.saveAndFlush(u);
      api.post("/api/auth/login").send(Map.of("phone", "0987654321", "password", "xuanhoa2026")).expect(401);
    }
  }

  @Nested
  @DisplayName("Kiểm tra phân quyền")
  class Guard {
    @Test
    @DisplayName("không có token trả 401")
    void noToken() {
      api.get("/api/auth/me").expect(401);
    }

    @Test
    @DisplayName("token giả trả 401")
    void fakeToken() {
      api.get("/api/auth/me").auth("khong-hop-le").expect(401);
    }

    @Test
    @DisplayName("sai vai trò trả 403")
    void wrongRole() {
      var patient = fx.createUser(Role.PATIENT);
      var res = api.get("/api/qr/current").auth(patient.token()).expect(403);
      assertThat(res.body().get("message").asText()).isEqualTo("Bạn không có quyền thực hiện thao tác này");
    }

    @Test
    @DisplayName("đúng vai trò thì gọi được")
    void rightRole() {
      var receptionist = fx.createUser(Role.RECEPTIONIST);
      var res = api.get("/api/qr/current").auth(receptionist.token()).expect(200);
      assertThat(res.body().get("token").isTextual()).isTrue();
    }

    @Test
    @DisplayName("API công khai không cần token")
    void publicApis() {
      api.get("/api/health").expect(200);
      api.get("/api/specialties").expect(200);
    }
  }
}
