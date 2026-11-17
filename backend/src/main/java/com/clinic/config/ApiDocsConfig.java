package com.clinic.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Trang tài liệu API (Swagger, /api/docs) liệt kê mọi đường dẫn và tham số, chỉ cần khi phát triển.
 * Mặc định: bật khi chạy dev, tắt trong image Docker (APP_ENV=production) để người ngoài truy cập qua
 * IP công khai không xem được. Muốn bật lại khi chạy thật thì đặt API_DOCS=true trong .env.
 */
@Configuration
public class ApiDocsConfig {

  public static boolean enabled(Map<String, String> env) {
    String flag = env.getOrDefault("API_DOCS", "").trim().toLowerCase();
    if (flag.equals("true") || flag.equals("1")) return true;
    if (flag.equals("false") || flag.equals("0")) return false;
    return !"production".equals(env.getOrDefault("APP_ENV", env.getOrDefault("NODE_ENV", "")));
  }

  @Bean
  public OpenAPI openApi() {
    return new OpenAPI()
        .info(new Info().title("Clinic Booking API").description("API đặt lịch khám, hàng đợi, bệnh án và đơn thuốc").version("0.1.0"))
        .components(new Components().addSecuritySchemes("bearer", new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
        .addSecurityItem(new SecurityRequirement().addList("bearer"));
  }
}
