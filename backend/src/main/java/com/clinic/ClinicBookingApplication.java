package com.clinic;

import com.clinic.cli.CliRunner;
import com.clinic.config.ApiDocsConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Backend hệ thống đặt lịch khám theo mô hình MVC của Spring:
 * <ul>
 *   <li>Model: entity JPA (package {@code entity}) và repository (package {@code repository})</li>
 *   <li>View: dữ liệu JSON trả về cho web React và app mobile (package {@code view}, {@code dto})</li>
 *   <li>Controller: nhận request HTTP, gọi service xử lý nghiệp vụ (package {@code controller}, {@code service})</li>
 * </ul>
 * Lệnh quản trị: {@code java -jar app.jar seed} (tạo dữ liệu mẫu),
 * {@code java -jar app.jar reset-password <số điện thoại>} (cấp mật khẩu tạm), xem {@link CliRunner}.
 */
@SpringBootApplication
public class ClinicBookingApplication {
  /** Đang chạy lệnh quản trị (không mở API, không chạy Socket.IO và việc định kỳ). */
  public static final String CLI_PROPERTY = "clinic.cli";

  public static void main(String[] args) {
    // Giờ trong CSDL lưu theo UTC; đặt múi giờ mặc định của JVM là UTC để máy chạy giờ Việt Nam (laptop Windows,
    // Jenkins đặt TZ) không làm lệch 7 tiếng khi ghi/đọc. Giờ hiển thị vẫn tính theo VnTime (Asia/Ho_Chi_Minh).
    java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));
    boolean docs = ApiDocsConfig.enabled(System.getenv());
    System.setProperty("springdoc.api-docs.enabled", String.valueOf(docs));
    System.setProperty("springdoc.swagger-ui.enabled", String.valueOf(docs));

    SpringApplication app = new SpringApplication(ClinicBookingApplication.class);
    boolean cli = args.length > 0 && CliRunner.COMMANDS.contains(args[0]);
    if (cli) {
      System.setProperty(CLI_PROPERTY, "true");
      app.setWebApplicationType(WebApplicationType.NONE);
      ConfigurableApplicationContext ctx = app.run(args);
      int code = ctx.getBean(CliRunner.class).getExitCode();
      System.exit(SpringApplication.exit(ctx, () -> code));
    }
    app.run(args);
  }
}
