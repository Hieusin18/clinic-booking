import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SessionsModule } from './auth/sessions.module.js';
import { UniqueErrorFilter } from './common/filters/unique-error.filter.js';
import { PatientPrivacyInterceptor } from './common/interceptors/patient-privacy.interceptor.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { HealthModule } from './health/health.module.js';
import { Icd10Module } from './icd10/icd10.module.js';
import { LabResultsModule } from './lab-results/lab-results.module.js';
import { MedicinesModule } from './medicines/medicines.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QrModule } from './qr/qr.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { SpecialtiesModule } from './specialties/specialties.module.js';
import { StaffModule } from './staff/staff.module.js';
import { StatsModule } from './stats/stats.module.js';
import { VisitsModule } from './visits/visits.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SessionsModule,
    AuthModule,
    SpecialtiesModule,
    DoctorsModule,
    StaffModule,
    MedicinesModule,
    SchedulesModule,
    AppointmentsModule,
    PatientsModule,
    RealtimeModule,
    NotificationsModule,
    StatsModule,
    VisitsModule,
    LabResultsModule,
    Icd10Module,
    MetricsModule,
    HealthModule,
    QrModule,
    QueueModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: UniqueErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: PatientPrivacyInterceptor },
  ],
})
export class AppModule {}
