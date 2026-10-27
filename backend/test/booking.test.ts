import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dateOnly, vnDateString } from '../src/common/time.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

/** "YYYY-MM-DD" cách hôm nay n ngày (giờ Việt Nam). */
const day = (n: number) => vnDateString(new Date(Date.now() + n * 86_400_000));

describe('Lịch khám và đặt lịch', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: Awaited<ReturnType<typeof createDoctor>>;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    doctor = await createDoctor(app, prisma);
  });
  afterAll(async () => app.close());

  /** Bác sĩ mở ca sáng ngày mai 8:00–9:00, mỗi lượt 15 phút → 4 khung giờ. */
  async function openTomorrow() {
    await api(app).post('/api/schedules/bulk').set(doctor.auth).send({ date: day(1), start: '08:00', end: '09:00', slotMinutes: 15 }).expect(201);
    const res = await api(app).get(`/api/doctors/${doctor.doctor.id}/schedules?date=${day(1)}`).expect(200);
    return res.body as { id: string; startTime: string }[];
  }

  describe('Khung giờ của bác sĩ', () => {
    it('tạo hàng loạt theo ca; tạo lại cùng ca thì bỏ qua, không trùng', async () => {
      const first = await api(app).post('/api/schedules/bulk').set(doctor.auth).send({ date: day(1), start: '08:00', end: '09:00', slotMinutes: 15 }).expect(201);
      expect(first.body).toEqual({ created: 4, skipped: 0 });
      const again = await api(app).post('/api/schedules/bulk').set(doctor.auth).send({ date: day(1), start: '08:00', end: '09:30', slotMinutes: 15 }).expect(201);
      expect(again.body).toEqual({ created: 2, skipped: 4 });
      expect(await prisma.schedule.count()).toBe(6);
    });

    it('giờ hiển thị đúng theo giờ Việt Nam', async () => {
      const slots = await openTomorrow();
      expect(new Date(slots[0].startTime).toISOString()).toBe(new Date(`${day(1)}T08:00:00+07:00`).toISOString());
    });

    it('không tạo được cho ngày đã qua hoặc giờ kết thúc trước giờ bắt đầu', async () => {
      await api(app).post('/api/schedules/bulk').set(doctor.auth).send({ date: day(-1), start: '08:00', end: '09:00', slotMinutes: 15 }).expect(400);
      await api(app).post('/api/schedules/bulk').set(doctor.auth).send({ date: day(1), start: '10:00', end: '09:00', slotMinutes: 15 }).expect(400);
    });

    it('chỉ bác sĩ tạo được khung giờ', async () => {
      const patient = await createPatient(app, prisma);
      await api(app).post('/api/schedules/bulk').set(patient.auth).send({ date: day(1), start: '08:00', end: '09:00', slotMinutes: 15 }).expect(403);
    });

    it('xóa được khung giờ trống, không xóa được khung giờ đã có người đặt', async () => {
      const [a, b] = await openTomorrow();
      const patient = await createPatient(app, prisma);
      await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: a.id }).expect(201);
      const res = await api(app).delete(`/api/schedules/${a.id}`).set(doctor.auth).expect(409);
      expect(res.body.message).toBe('Khung giờ đã có người đặt, không xóa được');
      await api(app).delete(`/api/schedules/${b.id}`).set(doctor.auth).expect(204);
    });

    it('bác sĩ không xóa được khung giờ của bác sĩ khác', async () => {
      const [a] = await openTomorrow();
      const other = await createDoctor(app, prisma);
      await api(app).delete(`/api/schedules/${a.id}`).set(other.auth).expect(404);
    });

    it('lịch làm việc của bác sĩ hiện tên bệnh nhân đã đặt', async () => {
      const [a] = await openTomorrow();
      const patient = await createPatient(app, prisma);
      await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: a.id, reason: 'Đau họng' }).expect(201);
      const res = await api(app).get(`/api/schedules/mine?from=${day(1)}&to=${day(1)}`).set(doctor.auth).expect(200);
      expect(res.body).toHaveLength(4);
      expect(res.body[0].appointments[0]).toMatchObject({ reason: 'Đau họng', patient: { fullName: patient.patient.fullName } });
    });
  });

  describe('Đặt lịch', () => {
    it('đặt thành công thì khung giờ biến mất khỏi danh sách trống', async () => {
      const [a] = await openTomorrow();
      const patient = await createPatient(app, prisma);
      const res = await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: a.id, reason: 'Sốt' }).expect(201);
      expect(res.body).toMatchObject({ status: 'CONFIRMED', reason: 'Sốt', schedule: { id: a.id, doctor: { id: doctor.doctor.id } } });
      const left = await api(app).get(`/api/doctors/${doctor.doctor.id}/schedules?date=${day(1)}`).expect(200);
      expect(left.body.map((s: { id: string }) => s.id)).not.toContain(a.id);
    });

    it('10 bệnh nhân cùng đặt một khung giờ đồng thời: đúng 1 người thành công, 9 người nhận 409', async () => {
      const [a] = await openTomorrow();
      const patients = await Promise.all(Array.from({ length: 10 }, () => createPatient(app, prisma)));
      const results = await Promise.all(patients.map((p) => api(app).post('/api/appointments').set(p.auth).send({ scheduleId: a.id })));
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(9);
      expect(await prisma.appointment.count({ where: { scheduleId: a.id } })).toBe(1);
    });

    it('không đặt được hai lịch với cùng bác sĩ trong một ngày', async () => {
      const [a, b] = await openTomorrow();
      const patient = await createPatient(app, prisma);
      await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: a.id }).expect(201);
      const res = await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: b.id }).expect(409);
      expect(res.body.message).toBe('Bạn đã có lịch với bác sĩ này trong ngày');
    });

    it('không đặt được khung giờ đã qua', async () => {
      const past = await prisma.schedule.create({
        data: { doctorId: doctor.doctor.id, date: dateOnly(day(0)), startTime: new Date(Date.now() - 3_600_000), endTime: new Date(Date.now() - 2_700_000) },
      });
      const patient = await createPatient(app, prisma);
      await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: past.id }).expect(409);
    });

    it('lễ tân không đặt lịch qua API của bệnh nhân', async () => {
      const [a] = await openTomorrow();
      const receptionist = await createUser(app, prisma, 'RECEPTIONIST');
      await api(app).post('/api/appointments').set(receptionist.auth).send({ scheduleId: a.id }).expect(403);
    });
  });

  describe('Hủy lịch và lịch sử', () => {
    it('hủy trước giờ khám thì khung giờ mở lại cho người khác đặt', async () => {
      const [a] = await openTomorrow();
      const p1 = await createPatient(app, prisma);
      const p2 = await createPatient(app, prisma);
      const booked = await api(app).post('/api/appointments').set(p1.auth).send({ scheduleId: a.id }).expect(201);
      const cancelled = await api(app).patch(`/api/appointments/${booked.body.id}/cancel`).set(p1.auth).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      await api(app).post('/api/appointments').set(p2.auth).send({ scheduleId: a.id }).expect(201);
    });

    it('không hủy được lịch đã qua giờ khám', async () => {
      const patient = await createPatient(app, prisma);
      const past = await prisma.schedule.create({
        data: { doctorId: doctor.doctor.id, date: dateOnly(day(-1)), startTime: new Date(Date.now() - 86_400_000), endTime: new Date(Date.now() - 86_000_000), isBooked: true },
      });
      const appt = await prisma.appointment.create({ data: { patientId: patient.patient.id, scheduleId: past.id, status: 'CONFIRMED' } });
      const res = await api(app).patch(`/api/appointments/${appt.id}/cancel`).set(patient.auth).expect(409);
      expect(res.body.message).toBe('Không hủy được lịch đã qua giờ khám');
    });

    it('bệnh nhân chỉ thấy và hủy được lịch của chính mình', async () => {
      const [a] = await openTomorrow();
      const p1 = await createPatient(app, prisma);
      const p2 = await createPatient(app, prisma);
      const booked = await api(app).post('/api/appointments').set(p1.auth).send({ scheduleId: a.id }).expect(201);

      expect((await api(app).get('/api/appointments/mine').set(p1.auth).expect(200)).body).toHaveLength(1);
      expect((await api(app).get('/api/appointments/mine').set(p2.auth).expect(200)).body).toHaveLength(0);
      await api(app).patch(`/api/appointments/${booked.body.id}/cancel`).set(p2.auth).expect(404);
    });

    it('lịch đã hủy chuyển sang mục đã qua', async () => {
      const [a] = await openTomorrow();
      const patient = await createPatient(app, prisma);
      const booked = await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: a.id }).expect(201);
      await api(app).patch(`/api/appointments/${booked.body.id}/cancel`).set(patient.auth).expect(200);
      expect((await api(app).get('/api/appointments/mine').set(patient.auth).expect(200)).body).toHaveLength(0);
      const past = await api(app).get('/api/appointments/mine?when=past').set(patient.auth).expect(200);
      expect(past.body[0].status).toBe('CANCELLED');
    });

    it('lễ tân xem được lịch hẹn theo ngày', async () => {
      const [a] = await openTomorrow();
      const patient = await createPatient(app, prisma);
      await api(app).post('/api/appointments').set(patient.auth).send({ scheduleId: a.id }).expect(201);
      const receptionist = await createUser(app, prisma, 'RECEPTIONIST');
      const res = await api(app).get(`/api/appointments?date=${day(1)}`).set(receptionist.auth).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].patient.fullName).toBe(patient.patient.fullName);
    });
  });
});
