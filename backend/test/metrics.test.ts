import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vnDateString } from '../src/common/time.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const tomorrow = () => vnDateString(new Date(Date.now() + 86_400_000));

/** Giá trị của một dòng số liệu dạng `ten{nhan} 3` trong văn bản Prometheus. */
function value(text: string, line: RegExp) {
  const m = text.split('\n').find((l) => line.test(l));
  return m ? Number(m.trim().split(/\s+/).at(-1)) : 0;
}

describe('Số liệu cho Prometheus (/api/metrics)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
  });
  afterAll(async () => app.close());

  it('không cần đăng nhập, trả định dạng text của Prometheus kèm số liệu Node.js', async () => {
    const res = await api(app).get('/api/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('nodejs_eventloop_lag_seconds');
    expect(res.text).toContain('app="clinic-backend"');
  });

  it('đếm request theo mẫu đường dẫn (không theo id thật) và mã trạng thái', async () => {
    await api(app).get('/api/health').expect(200);
    await api(app).get('/api/doctors/khong-ton-tai').expect(404);
    const res = await api(app).get('/api/metrics').expect(200);
    expect(value(res.text, /^http_requests_total\{.*route="\/api\/health".*status="200"/)).toBeGreaterThanOrEqual(1);
    expect(res.text).toMatch(/http_requests_total\{[^}]*route="\/api\/doctors\/:id"[^}]*status="404"/);
    expect(res.text).not.toContain('khong-ton-tai');
    await api(app).get('/api/khong-co-api-nay/123').expect(404);
    const after = await api(app).get('/api/metrics').expect(200);
    expect(after.text).toMatch(/http_requests_total\{[^}]*route="unmatched"[^}]*status="404"/);
    expect(after.text).not.toContain('khong-co-api-nay');
    expect(res.text).toMatch(/http_request_duration_seconds_bucket\{[^}]*route="\/api\/health"/);
  });

  it('đếm lịch hẹn đặt thành công và phiếu số được cấp', async () => {
    const before = await api(app).get('/api/metrics');
    const booked0 = value(before.text, /^clinic_appointments_booked_total/);
    const walkIn0 = value(before.text, /^clinic_queue_tickets_total\{.*source="WALK_IN"/);

    const doctor = await createDoctor(app, prisma);
    const patient = await createPatient(app, prisma);
    await api(app).post('/api/schedules/bulk').set(doctor.auth)
      .send({ date: tomorrow(), start: '08:00', end: '08:30', slotMinutes: 15 }).expect(201);
    const slots = await api(app).get(`/api/doctors/${doctor.doctor.id}/schedules?date=${tomorrow()}`).expect(200);
    await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: slots.body[0].id }).expect(201);

    const reception = await createUser(app, prisma, 'RECEPTIONIST');
    await api(app).post('/api/queue/tickets').set(reception.auth)
      .send({ patientId: patient.patient.id, doctorId: doctor.doctor.id }).expect(201);

    const after = await api(app).get('/api/metrics');
    expect(value(after.text, /^clinic_appointments_booked_total/)).toBe(booked0 + 1);
    expect(value(after.text, /^clinic_queue_tickets_total\{.*source="WALK_IN"/)).toBe(walkIn0 + 1);
  });
});
