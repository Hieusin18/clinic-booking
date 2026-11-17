package com.clinic.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Kết nối PostgreSQL từ biến DATABASE_URL (dạng postgresql://user:pass@host:5432/db như bản cũ),
 * để docker-compose, Jenkins credential và .env không phải đổi.
 */
@Configuration
public class DataSourceConfig {

  /** Thông tin kết nối JDBC tách từ URL kiểu PostgreSQL. */
  public record JdbcInfo(String url, String user, String password) {}

  public static JdbcInfo parse(String databaseUrl) {
    if (databaseUrl == null || databaseUrl.isBlank()) {
      throw new IllegalStateException("Thiếu biến môi trường DATABASE_URL");
    }
    if (databaseUrl.startsWith("jdbc:")) {
      String sep = databaseUrl.contains("?") ? "&" : "?";
      return new JdbcInfo(databaseUrl.contains("stringtype=") ? databaseUrl : databaseUrl + sep + "stringtype=unspecified", null, null);
    }
    URI uri = URI.create(databaseUrl.replaceFirst("^postgres(ql)?://", "http://"));
    String user = null;
    String password = null;
    if (uri.getRawUserInfo() != null) {
      String[] parts = uri.getRawUserInfo().split(":", 2);
      user = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
      if (parts.length > 1) password = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
    }
    int port = uri.getPort() > 0 ? uri.getPort() : 5432;
    // stringtype=unspecified: gửi chuỗi để PostgreSQL tự ép sang kiểu enum ("Role", "VisitStatus"…)
    String query = "?stringtype=unspecified" + (uri.getRawQuery() == null ? "" : "&" + uri.getRawQuery());
    return new JdbcInfo("jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getRawPath() + query, user, password);
  }

  @Bean
  public DataSource dataSource(Environment env) {
    JdbcInfo info = parse(env.getProperty("DATABASE_URL"));
    HikariDataSource ds = new HikariDataSource();
    ds.setJdbcUrl(info.url());
    if (info.user() != null) ds.setUsername(info.user());
    if (info.password() != null) ds.setPassword(info.password());
    ds.setMaximumPoolSize(10);
    ds.setPoolName("clinic-db");
    return ds;
  }
}
