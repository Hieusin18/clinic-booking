import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsController } from './metrics.controller.js';

@Module({ controllers: [MetricsController] })
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
