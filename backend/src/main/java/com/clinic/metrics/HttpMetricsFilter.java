package com.clinic.metrics;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

/**
 * Đo mọi request: dùng mẫu đường dẫn (/api/appointments/:id) thay vì đường dẫn thật để không sinh vô số nhãn.
 * Đường dẫn không khớp API nào gộp thành "unmatched".
 */
@Component
public class HttpMetricsFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
    long start = System.nanoTime();
    try {
      chain.doFilter(req, res);
    } finally {
      String route = route(req);
      String status = String.valueOf(res.getStatus());
      Metrics.HTTP_REQUESTS.labelValues(req.getMethod(), route, status).inc();
      Metrics.HTTP_DURATION.labelValues(req.getMethod(), route, status).observe((System.nanoTime() - start) / 1e9);
    }
  }

  static String route(HttpServletRequest req) {
    Object pattern = req.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
    if (!(pattern instanceof String p) || p.contains("*")) return "unmatched";
    return req.getContextPath() + p.replaceAll("\\{([^}/]+)}", ":$1");
  }
}
