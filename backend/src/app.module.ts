import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from './appointments/appointments.js';
import { AuthModule } from './auth/auth.module.js';
import { DoctorsModule } from './doctors/doctors.js';
import { HealthController } from './health/health.controller.js';
import { MedicinesModule } from './medicines/medicines.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QrController } from './qr/qr.controller.js';
import { QueueController } from './queue/queue.controller.js';
import { QueueService } from './queue/queue.service.js';
import { SchedulesModule } from './schedules/schedules.js';
import { SpecialtiesModule } from './specialties/specialties.js';
import { StaffModule } from './staff/staff.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SpecialtiesModule,
    DoctorsModule,
    StaffModule,
    MedicinesModule,
    SchedulesModule,
    AppointmentsModule,
  ],
  controllers: [HealthController, QrController, QueueController],
  providers: [QueueService],
})
export class AppModule {}
