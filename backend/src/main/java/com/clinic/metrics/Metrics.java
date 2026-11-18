package com.clinic.metrics;

import io.prometheus.metrics.core.metrics.Counter;
import io.prometheus.metrics.core.metrics.Histogram;
import io.prometheus.metrics.instrumentation.jvm.JvmMetrics;
import io.prometheus.metrics.model.registry.PrometheusRegistry;

/**
 * Số liệu cho Prometheus (GET /api/metrics, định dạng text của Prometheus).
 * Caddy chặn đường dẫn này từ bên ngoài; Prometheus đọc trực tiếp backend:3000 trong mạng Docker.
 * Tên số liệu giữ như bản cũ để dashboard Grafana và cảnh báo vẫn dùng được.
 */
public final class Metrics {
  public static final PrometheusRegistry REGISTRY = new PrometheusRegistry();

  public static final Counter HTTP_REQUESTS = Counter.builder()
      .name("http_requests_total")
      .help("Số request HTTP theo method, đường dẫn và mã trạng thái")
      .labelNames("method", "route", "status")
      .register(REGISTRY);

  public static final Histogram HTTP_DURATION = Histogram.builder()
      .name("http_request_duration_seconds")
      .help("Thời gian xử lý request HTTP (giây)")
      .labelNames("method", "route", "status")
      .classicUpperBounds(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5)
      .classicOnly()
      .register(REGISTRY);

  /** Số liệu nghiệp vụ: số lịch hẹn được đặt thành công. */
  public static final Counter APPOINTMENTS_BOOKED = Counter.builder()
      .name("clinic_appointments_booked_total")
      .help("Số lịch hẹn đặt thành công")
      .register(REGISTRY);

  /** Số liệu nghiệp vụ: số phiếu số thứ tự được cấp, theo nguồn (ONLINE / WALK_IN). */
  public static final Counter QUEUE_TICKETS = Counter.builder()
      .name("clinic_queue_tickets_total")
      .help("Số phiếu số thứ tự được cấp")
      .labelNames("source")
      .register(REGISTRY);

  static {
    // CPU, RAM, heap, GC, luồng… của JVM (thay cho số liệu Node.js của bản cũ)
    JvmMetrics.builder().register(REGISTRY);
    // Tạo sẵn chuỗi số liệu = 0 để Grafana hiện 0 thay vì "No data" khi chưa có phiếu nào
    QUEUE_TICKETS.labelValues("ONLINE").inc(0);
    QUEUE_TICKETS.labelValues("WALK_IN").inc(0);
  }

  private Metrics() {}
}
