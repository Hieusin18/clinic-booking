import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { apiDocsEnabled } from './common/utils/api-docs.util.js';

async function bootstrap() {
  // rawBody: kiểm tra chữ ký HMAC của cổng SMS Android trên đúng thân yêu cầu gốc (sms/phone-verify.service.ts)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Chạy sau Caddy (mạng nội bộ Docker): lấy IP thật của người dùng từ X-Forwarded-For để chặn dò mật khẩu theo IP
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Tài liệu API chỉ bật khi dev (hoặc API_DOCS=true), xem common/utils/api-docs.util.ts
  if (apiDocsEnabled()) {
    const swagger = new DocumentBuilder()
      .setTitle('Clinic Booking API')
      .setDescription('API đặt lịch khám, hàng đợi, bệnh án và đơn thuốc')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

bootstrap();
