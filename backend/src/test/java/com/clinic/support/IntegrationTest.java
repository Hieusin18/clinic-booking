package com.clinic.support;

import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.PatientRepository;
import com.clinic.repository.ScheduleRepository;
import com.clinic.repository.UserRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.service.AuthService;
import com.clinic.util.VnTime;
import java.io.IOException;
import java.net.ServerSocket;
import java.time.Instant;
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
    // Test cũ gọi bệnh nhân không qua bước đo sinh hiệu; VitalsFlowTest bật lại qua PUT /api/settings
    setDefault("VITALS_BEFORE_EXAM", "false");
    // Test cũ cấp số vãng lai cho bác sĩ chưa mở ca; WalkInCapacityTest bật lại qua PUT /api/settings
    setDefault("WALK_IN_LIMIT", "false");
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

  @Autowired
  protected UserRepository users;

  @Autowired
  protected PatientRepository patients;

  @Autowired
  protected DoctorRepository doctors;

  @Autowired
  protected ScheduleRepository schedules;

  @Autowired
  protected AppointmentRepository appointments;

  @Autowired
  protected VisitRepository visits;

  @Autowired
  private AuthService authService;

  @Autowired
  @org.springframework.beans.factory.annotation.Qualifier("notificationExecutor")
  private org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor notificationExecutor;

  protected Api api;

  @BeforeEach
  void setUpApi() {
    api = new Api(port);
    Sockets.port = port;
    fx.setApi(api);
    resetDb();
    // Mỗi lớp test của bản cũ chạy một ứng dụng mới; ở đây dùng chung nên xóa bộ đếm nhập sai theo IP
    authService.clearFailedLogins();
  }

  /** "YYYY-MM-DD" cách hôm nay n ngày (giờ Việt Nam). */
  protected static String day(int n) {
    return VnTime.dateString(Instant.now().plusSeconds(n * 86_400L));
  }

  /** Đếm số dòng của một bảng (có thể kèm điều kiện SQL). */
  protected long count(String table, String where, Object... args) {
    Long n = jdbc.queryForObject("SELECT count(*) FROM \"" + table + "\"" + (where == null ? "" : " WHERE " + where), Long.class, args);
    return n == null ? 0 : n;
  }

  protected long count(String table) {
    return count(table, null);
  }

  /**
   * Xóa sạch dữ liệu mọi bảng (giữ cấu trúc). Chờ việc chạy nền của test trước (gửi thông báo) xong trước, và thử lại
   * nếu TRUNCATE đụng khóa với một giao dịch còn dở.
   */
  protected void resetDb() {
    waitForBackgroundWork();
    var tables = jdbc.queryForList(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('flyway_schema_history', '_prisma_migrations')",
        String.class);
    if (tables.isEmpty()) return;
    String sql = "TRUNCATE TABLE " + String.join(", ", tables.stream().map(t -> "\"public\".\"" + t + "\"").toList()) + " RESTART IDENTITY CASCADE";
    for (int attempt = 1; ; attempt++) {
      try {
        jdbc.execute(sql);
        return;
      } catch (org.springframework.dao.PessimisticLockingFailureException e) {
        if (attempt >= 5) throw e;
        sleep(200);
        waitForBackgroundWork();
      }
    }
  }

  private void waitForBackgroundWork() {
    for (int i = 0; i < 100; i++) {
      var pool = notificationExecutor.getThreadPoolExecutor();
      if (pool.getActiveCount() == 0 && pool.getQueue().isEmpty()) return;
      sleep(20);
    }
  }

  private static void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
