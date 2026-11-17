package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.cli.CliRunner;
import com.clinic.cli.SeedHistory;
import com.clinic.cli.SeedService;
import com.clinic.entity.enums.Role;
import com.clinic.service.StatsService;
import com.clinic.support.IntegrationTest;
import com.clinic.util.VnTime;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Lệnh trên máy chủ: dữ liệu mẫu, lịch sử mẫu, đặt lại mật khẩu")
class CliTest extends IntegrationTest {
  @Autowired
  SeedService seed;
  @Autowired
  SeedHistory history;
  @Autowired
  StatsService stats;
  @Autowired
  CliRunner cli;

  @Test
  @DisplayName("dữ liệu mẫu: đăng nhập được tài khoản admin; chạy lại không tạo trùng")
  void seedData() {
    seed.run();
    seed.run();
    api.post("/api/auth/login").send(Map.of("phone", "0900000001", "password", "123456")).expect(200);
    assertThat(count("User", "\"phone\" = ?", "0900000001")).isEqualTo(1);
    assertThat(count("Doctor", "true")).isPositive();
  }

  @Test
  @DisplayName("lịch sử mẫu cho trang Thống kê: tạo, không tạo lại khi đã có, xóa trọn vẹn")
  void seedHistory() {
    seed.run();
    Instant now = Instant.now();
    assertThat(history.generate(14, now)).startsWith("Đã tạo dữ liệu mẫu 14 ngày");
    assertThat(history.generate(14, now)).contains("--reset");
    String from = VnTime.dateString(now.minusSeconds(14 * 86_400L));
    String to = VnTime.dateString(now.minusSeconds(86_400L));
    Map<String, Object> s = stats.overview(from, to, now);
    @SuppressWarnings("unchecked")
    Map<String, Object> kpis = (Map<String, Object>) s.get("kpis");
    assertThat(((Number) kpis.get("visits")).intValue()).isPositive();
    assertThat(((Number) kpis.get("completed")).intValue()).isPositive();
    assertThat(kpis.get("waitMedian")).isNotNull();

    assertThat(history.reset()).startsWith("Đã xóa 260 bệnh nhân mẫu");
    assertThat(count("Patient", "\"phone\" LIKE '0989%'")).isZero();
    assertThat(count("Visit", "true")).isZero();
    assertThat(history.reset()).isEqualTo("Không có dữ liệu mẫu để xóa.");
  }

  @Test
  @DisplayName("reset-password: in mật khẩu tạm; số không có tài khoản thì báo lỗi")
  void resetPassword() {
    var admin = fx.createUser(Role.ADMIN);
    cli.run("reset-password", admin.user().getPhone());
    assertThat(cli.getExitCode()).isZero();
    api.get("/api/auth/me").auth(admin.token()).expect(401);
    cli.run("reset-password", "0999999999");
    assertThat(cli.getExitCode()).isEqualTo(1);
  }
}
