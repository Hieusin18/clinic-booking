package com.clinic.config;

import com.clinic.util.QueueRules;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class QueueRulesConfig {
  /** Các mốc thời gian của hàng đợi, đọc từ biến môi trường (xem .env.example). */
  @Bean
  public QueueRules queueRules(AppEnv env) {
    return QueueRules.from(env::get);
  }
}
