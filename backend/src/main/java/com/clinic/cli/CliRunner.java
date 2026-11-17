package com.clinic.cli;

import com.clinic.repository.UserRepository;
import com.clinic.service.AccountsService;
import java.util.Map;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Lệnh quản trị chạy trên máy chủ (không mở API):
 * <pre>
 *   docker compose -f docker-compose.prod.yml run --rm seed                    # dữ liệu mẫu
 *   docker compose run --rm seed java -jar app.jar seed-history [--days 90]    # lịch sử khám mẫu cho trang Thống kê
 *   docker compose run --rm seed java -jar app.jar seed-history --reset        # xóa lịch sử khám mẫu
 *   docker compose exec backend java -jar app.jar reset-password 0900000001  # admin quên mật khẩu
 * </pre>
 */
@Component
public class CliRunner implements CommandLineRunner {
  /** Các lệnh được hỗ trợ. */
  public static final java.util.Set<String> COMMANDS = java.util.Set.of("seed", "seed-history", "reset-password");

  private final SeedService seed;
  private final SeedHistory history;
  private final UserRepository users;
  private final AccountsService accounts;
  private int exitCode;

  public CliRunner(SeedService seed, SeedHistory history, UserRepository users, AccountsService accounts) {
    this.seed = seed;
    this.history = history;
    this.users = users;
    this.accounts = accounts;
  }

  public int getExitCode() {
    return exitCode;
  }

  @Override
  @SuppressWarnings("java:S106")
  public void run(String... args) {
    if (args.length == 0 || !COMMANDS.contains(args[0])) return;
    if (args[0].equals("seed")) {
      seed.run();
      System.out.println("Đã tạo dữ liệu mẫu. Tài khoản (mật khẩu 123456):");
      System.out.println("  Admin 0900000001 · Lễ tân 0900000002 · Bệnh nhân 0900000003 · Bác sĩ 0910000001–0910000006");
      return;
    }
    if (args[0].equals("seed-history")) {
      boolean reset = java.util.Arrays.asList(args).contains("--reset");
      System.out.println(reset ? history.reset() : history.generate(SeedHistory.days(args), java.time.Instant.now()));
      return;
    }
    // Đặt lại mật khẩu khi không còn admin nào đăng nhập được: in ra mật khẩu tạm, lần đăng nhập sau phải đổi mật khẩu
    String phone = args.length > 1 ? args[1] : null;
    if (phone == null || !phone.matches("^0\\d{9}$")) {
      System.err.println("Cách dùng: java -jar app.jar reset-password <số điện thoại 10 số>");
      exitCode = 1;
      return;
    }
    var user = users.findByPhone(phone).orElse(null);
    if (user == null) {
      System.err.println("Không có tài khoản nào với số " + phone);
      exitCode = 1;
      return;
    }
    Map<String, Object> r = accounts.issueTemporaryPassword(user.getId());
    @SuppressWarnings("unchecked")
    Map<String, Object> u = (Map<String, Object>) r.get("user");
    System.out.println("Đã đặt lại mật khẩu cho " + u.get("fullName") + " (" + u.get("role") + ").");
    System.out.println("Mật khẩu tạm: " + r.get("temporaryPassword"));
    System.out.println("Lần đăng nhập sau sẽ phải đổi mật khẩu. Các máy đang đăng nhập tài khoản này đã bị đăng xuất.");
  }
}
