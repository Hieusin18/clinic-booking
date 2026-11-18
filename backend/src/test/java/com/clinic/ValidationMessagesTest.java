package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Câu báo lỗi dữ liệu gửi lên giống bản NestJS (class-validator)")
class ValidationMessagesTest extends IntegrationTest {
  static List<String> messages(JsonNode body) {
    List<String> out = new ArrayList<>();
    body.get("message").forEach(m -> out.add(m.asText()));
    return out;
  }

  @Test
  @DisplayName("thiếu trường, vượt giới hạn, giá trị không thuộc danh sách; xếp theo thứ tự trường")
  void messagesLikeNest() {
    assertThat(messages(api.post("/api/auth/login").send(Map.of("phone", "123")).expect(400).body()))
        .containsExactly("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0", "password must be a string");
    String admin = fx.createUser(Role.ADMIN).token();
    var doctor = fx.createDoctor();
    assertThat(messages(api.patch("/api/doctors/" + doctor.doctor().getId()).auth(admin).send(Map.of("practiceSince", 2999)).expect(400).body()))
        .containsExactly("practiceSince must not be greater than 2100");
    String reception = fx.createUser(Role.RECEPTIONIST).token();
    assertThat(messages(api.post("/api/patients").auth(reception)
        .send(Map.of("fullName", "Ai Đó", "phone", "0912345678", "dateOfBirth", "1990-01-01", "gender", "KHAC")).expect(400).body()))
        .containsExactly("gender must be one of the following values: MALE, FEMALE, OTHER");
  }
}
