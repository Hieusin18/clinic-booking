package com.clinic.support;

import java.io.IOException;
import java.net.ServerSocket;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Lớp cha của test tích hợp: chạy cả ứng dụng ở cổng ngẫu nhiên với PostgreSQL thật (DATABASE_URL, mặc định
 * postgresql://clinic:clinic@localhost:5432/clinic_test), xóa sạch dữ liệu trước mỗi test.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IntegrationTest {
  static {
    // Biến môi trường mặc định cho test (giống test/setup-env.ts của bản cũ)
    setDefault("DATABASE_URL", "postgresql://clinic:clinic@localhost:5432/clinic_test");
    setDefault("JWT_SECRET", "test-jwt-secret");
    setDefault("QR_SECRET", "test-qr-secret");
    setDefault("QR_TTL_SECONDS", "60");
    setDefault("CLINIC_ID", "phong-kham-test");
    setDefault("QUEUE_SWEEP_SECONDS", "0");
    setDefault("REMINDER_SWEEP_SECONDS", "0");
    // Test cũ đăng ký không qua bước nhắn tin xác minh; PhoneVerifyTest bật lại khi cần
    setDefault("REQUIRE_PHONE_VERIFICATION", "false");
    setDefault("SOCKET_PORT", String.valueOf(freePort()));
  }

  private static void setDefault(String key, String value) {
    if (System.getenv(key) == null && System.getProperty(key) == null) System.setProperty(key, value);
  }

  private static int freePort() {
    try (ServerSocket s = new ServerSocket(0)) {
      return s.getLocalPort();
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  @LocalServerPort
  protected int port;

  @Autowired
  protected JdbcTemplate jdbc;

  @Autowired
  protected Fixtures fx;

  protected Api api;

  @BeforeEach
  void setUpApi() {
    api = new Api(port);
    fx.setApi(api);
    resetDb();
  }

  /** Xóa sạch dữ liệu mọi bảng (giữ cấu trúc). */
  protected void resetDb() {
    var tables = jdbc.queryForList(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('flyway_schema_history', '_prisma_migrations')",
        String.class);
    if (tables.isEmpty()) return;
    jdbc.execute("TRUNCATE TABLE " + String.join(", ", tables.stream().map(t -> "\"public\".\"" + t + "\"").toList()) + " RESTART IDENTITY CASCADE");
  }
}
