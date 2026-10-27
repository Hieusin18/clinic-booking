import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { QrController } from './qr/qr.controller.js';
import { QueueController } from './queue/queue.controller.js';
import { QueueService } from './queue/queue.service.js';

// Các module còn lại (auth, specialties, doctors, schedules, appointments,
// patients, medical-records, prescriptions) thêm vào đây theo kế hoạch tuần 1–2.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController, QrController, QueueController],
  providers: [QueueService],
})
export class AppModule {}
