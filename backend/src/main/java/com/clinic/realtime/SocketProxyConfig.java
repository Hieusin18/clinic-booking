package com.clinic.realtime;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/** Đăng ký bộ chuyển tiếp /api/socket.io/* (xem {@link SocketProxyFilter}). */
@Configuration
public class SocketProxyConfig {
  @Bean
  public FilterRegistrationBean<SocketProxyFilter> socketProxyFilter(RealtimeGateway gateway) {
    FilterRegistrationBean<SocketProxyFilter> reg = new FilterRegistrationBean<>(new SocketProxyFilter(gateway.getPort()));
    reg.addUrlPatterns("/socket.io/*", "/socket.io");
    reg.setAsyncSupported(true);
    // Chạy trước các filter khác (đo số liệu, mã hóa ký tự) vì request không đi vào controller nào
    reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
    return reg;
  }
}
