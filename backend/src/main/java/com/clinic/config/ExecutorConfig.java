package com.clinic.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class ExecutorConfig {
  /** Luồng riêng để gửi thông báo (lưu hộp thư, báo realtime, đẩy Expo) mà không làm chậm API. */
  @Bean("notificationExecutor")
  public ThreadPoolTaskExecutor notificationExecutor() {
    ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
    ex.setCorePoolSize(2);
    ex.setMaxPoolSize(4);
    ex.setQueueCapacity(1000);
    ex.setThreadNamePrefix("notify-");
    ex.setWaitForTasksToCompleteOnShutdown(true);
    ex.initialize();
    return ex;
  }
}
