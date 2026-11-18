package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import com.clinic.support.IntegrationTest;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Dữ liệu trùng trả 409 kèm lý do, không phải lỗi 500")
class UniqueErrorTest extends IntegrationTest {
  static Map<String, Object> patient(String phone, String email) {
    Map<String, Object> m = new HashMap<>(Map.of("fullName", "Người Đăng Ký", "phone", phone, "password", "xuanhoa2026", "dateOfBirth", "1990-01-01",
        "gender", "MALE"));
    if (email != null) m.put("email", email);
    return m;
  }

  @Test
  @DisplayName("đăng ký bằng email đã có người dùng")
  void registerDuplicateEmail() {
    api.post("/api/auth/register").send(patient("0987000222", "a@b.vn")).expect(201);
    var res = api.post("/api/auth/register").send(patient("0987000333", "a@b.vn")).expect(409);
    assertThat(res.body().get("message").asText()).isEqualTo("Email đã được dùng cho tài khoản khác");
    // Không để lại tài khoản dở dang
    assertThat(users.findByPhone("0987000333")).isEmpty();
  }

  @Test
  @DisplayName("admin tạo lễ tân / bác sĩ trùng email")
  void staffDuplicateEmail() {
    var admin = fx.createUser(Role.ADMIN);
    User u = users.findById(admin.user().getId()).orElseThrow();
    u.setEmail("admin@pk.vn");
    users.saveAndFlush(u);
    var res = api.post("/api/staff/receptionists").auth(admin.token())
        .send(Map.of("fullName", "Lễ Tân Mới", "phone", "0987000444", "email", "admin@pk.vn", "password", "letan2026")).expect(409);
    assertThat(res.body().get("message").asText()).isEqualTo("Email đã được dùng cho tài khoản khác");

    var specialty = fx.createSpecialty("Nội tổng quát");
    api.post("/api/doctors").auth(admin.token())
        .send(Map.of("fullName", "Bác Sĩ Mới", "phone", "0987000555", "email", "admin@pk.vn", "password", "bacsi2026", "specialtyId", specialty.getId()))
        .expect(409);
  }
}
