import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { httpDuration, httpRequests } from './metrics.registry.js';

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
