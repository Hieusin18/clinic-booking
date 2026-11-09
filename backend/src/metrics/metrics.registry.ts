import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/**
 * Số liệu cho Prometheus (GET /api/metrics, định dạng text của Prometheus).
 * Caddy chặn đường dẫn này từ bên ngoài; Prometheus đọc trực tiếp backend:3000 trong mạng Docker.
 */
export const registry = new Registry();
registry.setDefaultLabels({ app: 'clinic-backend' });

// CPU, RAM, event loop lag, GC… của tiến trình Node.js
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Số request HTTP theo method, đường dẫn và mã trạng thái',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý request HTTP (giây)',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/** Số liệu nghiệp vụ: số lịch hẹn được đặt thành công. */
export const appointmentsBooked = new Counter({
  name: 'clinic_appointments_booked_total',
  help: 'Số lịch hẹn đặt thành công',
  registers: [registry],
});

/** Số liệu nghiệp vụ: số phiếu số thứ tự được cấp, theo nguồn (ONLINE / WALK_IN). */
export const queueTickets = new Counter({
  name: 'clinic_queue_tickets_total',
  help: 'Số phiếu số thứ tự được cấp',
  labelNames: ['source'] as const,
  registers: [registry],
});
// Tạo sẵn chuỗi số liệu = 0 để Grafana hiện 0 thay vì "No data" khi chưa có phiếu nào
for (const source of ['ONLINE', 'WALK_IN']) queueTickets.labels({ source }).inc(0);
