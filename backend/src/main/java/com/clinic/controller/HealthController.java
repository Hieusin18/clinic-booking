package com.clinic.controller;

import com.clinic.config.JacksonConfig;
import com.clinic.security.Public;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/health")
public class HealthController {
  private final JdbcTemplate jdbc;

  public HealthController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** Dùng cho healthcheck của Docker và để kiểm tra sau khi deploy (có truy vấn thử CSDL). */
  @Public
  @GetMapping
  public Map<String, Object> check() {
    jdbc.queryForObject("SELECT 1", Integer.class);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("status", "ok");
    body.put("time", JacksonConfig.iso(Instant.now()));
    return body;
  }
}
