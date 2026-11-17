package com.clinic;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Backend hệ thống đặt lịch khám theo mô hình MVC của Spring:
 * <ul>
 *   <li>Model: entity JPA (package {@code entity}) và repository (package {@code repository})</li>
 *   <li>View: dữ liệu JSON trả về cho web React và app mobile (package {@code view}, {@code dto})</li>
 *   <li>Controller: nhận request HTTP, gọi service (package {@code controller}, {@code service})</li>
 * </ul>
 * Chạy thêm lệnh quản trị: {@code java -jar app.jar seed} (tạo dữ liệu mẫu),
 * {@code java -jar app.jar reset-password <số điện thoại>} (cấp mật khẩu tạm), xem package {@code cli}.
 */
@SpringBootApplication
@EnableScheduling
public class ClinicBookingApplication {
  public static void main(String[] args) {
    boolean docs = com.clinic.config.ApiDocsConfig.enabled(System.getenv());
    System.setProperty("springdoc.api-docs.enabled", String.valueOf(docs));
    System.setProperty("springdoc.swagger-ui.enabled", String.valueOf(docs));
    SpringApplication.run(ClinicBookingApplication.class, args);
  }
}
