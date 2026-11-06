import { Controller, Get, Header, Injectable, MiddlewareConsumer, Module, NestMiddleware, NestModule } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { Public } from '../auth/decorators.js';

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

/** Đo mọi request: dùng mẫu đường dẫn (/api/appointments/:id) thay vì đường dẫn thật để không sinh vô số nhãn. */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      // Đường dẫn không khớp API nào (route bắt-tất-cả của Nest chứa "*") gộp thành 'unmatched'
      const path = req.route?.path as string | undefined;
      const labels = {
        method: req.method,
        route: path && !path.includes('*') ? `${req.baseUrl ?? ''}${path}` : 'unmatched',
        status: String(res.statusCode),
      };
      end(labels);
      httpRequests.inc(labels);
    });
    next();
  }
}

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  @Header('Content-Type', registry.contentType)
  metrics() {
    return registry.metrics();
  }
}

@Module({ controllers: [MetricsController] })
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
