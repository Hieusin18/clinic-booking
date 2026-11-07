import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { todayVN } from '../src/common/time.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createQrToken } from '../src/qr/qr-token.js';
import { QueueJanitor } from '../src/queue/queue-janitor.js';
import { createDoctor, createPatient, createUser, nextPhone } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const MIN = 60_000;
const DAY = 86_400_000;

describe('Ưu tiên gọi số, khung giờ check-in và lịch không đến', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reception: { Authorization: string };
  let doctor: Awaited<ReturnType<typeof createDoctor>>;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
    doctor = await createDoctor(app, prisma);
  });
  afterAll(async () => app.close());

  const qr = () => createQrToken(process.env.CLINIC_ID!, process.env.QR_SECRET!, Date.now());

  /** Lịch hẹn hôm nay với giờ hẹn cách hiện tại `minutes` phút (âm = đã qua). */
  async function book(patientId: string, minutes: number, opts: { date?: Date; status?: 'CONFIRMED' | 'NO_SHOW' } = {}) {
    const start = new Date(Date.now() + minutes * MIN + Math.floor(Math.random() * 1000));
    const slot = await prisma.schedule.create({
      data: { doctorId: doctor.doctor.id, date: opts.date ?? todayVN(), startTime: start, endTime: new Date(start.getTime() + 15 * MIN), isBooked: true },
    });
    return prisma.appointment.create({ data: { patientId, scheduleId: slot.id, status: opts.status ?? 'CONFIRMED' } });
  }

  const walkIn = async () => {
    const p = await prisma.patient.create({ data: { fullName: 'Ông Năm', phone: nextPhone(), dateOfBirth: new Date('1955-03-03'), gender: 'MALE' } });
    return (await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id }).expect(201)).body;
  };
  const checkIn = async (appointmentId: string) =>
    (await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId }).expect(201)).body;
  const callNext = async () => (await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200)).body;
  const finish = (visitId: string) => api(app).patch(`/api/queue/${visitId}/left`).set(doctor.auth).expect(200);

  describe('Hai dãy số A và B', () => {
    it('đặt lịch đánh số A từ 1, vãng lai đánh số B từ 1', async () => {
      const b = await walkIn();
      const a = await checkIn((await book((await createPatient(app, prisma)).patient.id, 10)).id);
      expect([a.source, a.queueNumber, b.source, b.queueNumber]).toEqual(['ONLINE', 1, 'WALK_IN', 1]);
      expect(a.appointmentAt).toBeTruthy();
    });
  });

  describe('Khung giờ check-in', () => {
    it('đến quá sớm: báo giờ mở check-in; lễ tân vẫn check-in ngoài giờ được', async () => {
      const appt = await book((await createPatient(app, prisma)).patient.id, 60);
      const res = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id }).expect(409);
      expect(res.body.code).toBe('CHECKIN_TOO_EARLY');
      expect(res.body.message).toMatch(/^Lịch hẹn lúc \d\d:\d\d mở check-in từ \d\d:\d\d\./);
      const ok = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id, override: true }).expect(201);
      expect(ok.body).toMatchObject({ source: 'ONLINE', checkinOverride: true });
    });

    it('bệnh nhân quét QR quá sớm cũng bị báo giờ mở check-in', async () => {
      const p = await createPatient(app, prisma);
      await book(p.patient.id, 45);
      const res = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr() }).expect(409);
      expect(res.body.code).toBe('CHECKIN_TOO_EARLY');
    });

    it('đến trễ quá 15 phút: lịch hẹn thành không đến, phải lấy số thường (dãy B)', async () => {
      const p = await createPatient(app, prisma);
      const appt = await book(p.patient.id, -20);
      const res = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr() }).expect(400);
      expect(res.body.code).toBe('NEEDS_DOCTOR');
      expect(res.body.message).toMatch(/trễ quá 15 phút/);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('NO_SHOW');

      const ticket = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr(), doctorId: doctor.doctor.id }).expect(201);
      expect(ticket.body).toMatchObject({ source: 'WALK_IN', appointmentId: null });
    });

    it('lễ tân check-in lịch đã bị tính không đến: lịch hẹn được khôi phục, vẫn giữ dãy A', async () => {
      const appt = await book((await createPatient(app, prisma)).patient.id, -40);
      const late = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id }).expect(409);
      expect(late.body).toMatchObject({ code: 'CHECKIN_TOO_LATE', appointmentAt: expect.any(String), closesAt: expect.any(String) });
      const ok = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id, override: true }).expect(201);
      expect(ok.body).toMatchObject({ source: 'ONLINE', checkinOverride: true, appointmentId: appt.id });
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('CONFIRMED');
    });

    it('lễ tân thấy cả lịch đã bị tính không đến trong danh sách hôm nay', async () => {
      await book((await createPatient(app, prisma)).patient.id, -40, { status: 'NO_SHOW' });
      const res = await api(app).get('/api/appointments').set(reception).expect(200);
      expect(res.body.map((a: { status: string }) => a.status)).toEqual(['NO_SHOW']);
      const start = new Date(res.body[0].schedule.startTime).getTime();
      expect(start - new Date(res.body[0].checkinOpensAt).getTime()).toBe(30 * MIN);
    });
  });

  describe('Thứ tự gọi số', () => {
    it('người đặt lịch đã đến giờ được gọi trước người vãng lai đến sớm hơn', async () => {
      const b = await walkIn();
      const a = await checkIn((await book((await createPatient(app, prisma)).patient.id, 5)).id);
      const first = await callNext();
      expect(first).toMatchObject({ id: a.id, callRule: 'APPOINTMENT' });
      await finish(first.id);
      expect(await callNext()).toMatchObject({ id: b.id, callRule: 'ARRIVAL' });
    });

    it('người đặt lịch chưa đến giờ thì xếp theo thứ tự đến quầy', async () => {
      const b = await walkIn();
      await checkIn((await book((await createPatient(app, prisma)).patient.id, 25)).id);
      expect(await callNext()).toMatchObject({ id: b.id, callRule: 'ARRIVAL' });
    });

    it('sau 3 lượt ưu tiên liên tiếp thì gọi người vãng lai đang chờ', async () => {
      const b = await walkIn();
      const booked = [];
      for (let i = 1; i <= 4; i++) booked.push(await checkIn((await book((await createPatient(app, prisma)).patient.id, i)).id));
      const order = [];
      for (let i = 0; i < 5; i++) {
        const v = await callNext();
        order.push(v.callRule);
        await finish(v.id);
        if (i === 3) expect(v.id).toBe(b.id);
      }
      expect(order).toEqual(['APPOINTMENT', 'APPOINTMENT', 'APPOINTMENT', 'FAIRNESS', 'APPOINTMENT']);
    });

    it('bác sĩ gọi đích danh một người đang chờ', async () => {
      await walkIn();
      const second = await walkIn();
      const other = await createDoctor(app, prisma);
      await api(app).post(`/api/queue/${second.id}/call`).set(other.auth).expect(404);
      const res = await api(app).post(`/api/queue/${second.id}/call`).set(doctor.auth).expect(200);
      expect(res.body).toMatchObject({ id: second.id, status: 'IN_PROGRESS', callRule: 'MANUAL' });
      await finish(second.id);
      const again = await api(app).post(`/api/queue/${second.id}/call`).set(doctor.auth).expect(409);
      expect(again.body.message).toBe('Số B02 không còn trong hàng chờ');
    });

    it('số người phía trước tính theo đúng thứ tự gọi; hàng đợi kèm thứ tự dự kiến', async () => {
      const p = await createPatient(app, prisma);
      const mine = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr(), doctorId: doctor.doctor.id }).expect(201);
      const booker = await createPatient(app, prisma);
      await book(booker.patient.id, 5);
      const a = (await api(app).post('/api/queue/scan').set(booker.auth).send({ token: qr() }).expect(201)).body;

      const posB = await api(app).get(`/api/queue/${mine.body.id}/position`).set(p.auth).expect(200);
      expect(posB.body).toMatchObject({ label: 'B01', peopleAhead: 1, due: false });
      const posA = await api(app).get(`/api/queue/${a.id}/position`).set(booker.auth).expect(200);
      expect(posA.body).toMatchObject({ label: 'A01', peopleAhead: 0, due: true });
      expect(new Date(posB.body.estimatedCallAt).getTime()).toBeGreaterThan(new Date(posA.body.estimatedCallAt).getTime());

      const board = await api(app).get('/api/queue/doctor').set(doctor.auth).expect(200);
      const order = Object.fromEntries(board.body.map((v: { id: string; predictedOrder: number }) => [v.id, v.predictedOrder]));
      expect(order).toEqual({ [mine.body.id]: 1, [a.id]: 0 });
    });
  });

  describe('Tự đóng lịch không đến', () => {
    it('lịch quá giờ hẹn 15 phút chưa check-in thành không đến; số còn chờ của ngày cũ thành bỏ về', async () => {
      const p = await createPatient(app, prisma);
      const late = await book(p.patient.id, -20);
      const stillOk = await book((await createPatient(app, prisma)).patient.id, -10);
      const yesterday = new Date(todayVN().getTime() - DAY);
      const old = await book((await createPatient(app, prisma)).patient.id, -DAY / MIN, { date: yesterday });
      const oldVisit = await prisma.visit.create({
        data: { patientId: old.patientId, doctorId: doctor.doctor.id, date: yesterday, queueNumber: 1, source: 'ONLINE', checkinMethod: 'QR', appointmentId: old.id },
      });

      const result = await app.get(QueueJanitor).sweep();
      expect(result).toEqual({ noShow: 1, left: 1 });
      const status = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status;
      expect([await status(late.id), await status(stillOk.id), await status(old.id)]).toEqual(['NO_SHOW', 'CONFIRMED', 'NO_SHOW']);
      expect((await prisma.visit.findUniqueOrThrow({ where: { id: oldVisit.id } })).status).toBe('LEFT');
    });

    it('lịch hẹn còn trong khung check-in vẫn ở mục sắp tới', async () => {
      const p = await createPatient(app, prisma);
      const appt = await book(p.patient.id, -10);
      const upcoming = await api(app).get('/api/appointments/mine').set(p.auth).expect(200);
      expect(upcoming.body.map((a: { id: string }) => a.id)).toEqual([appt.id]);
      const { startTime } = upcoming.body[0].schedule;
      expect(new Date(upcoming.body[0].checkinClosesAt).getTime() - new Date(startTime).getTime()).toBe(15 * MIN);
      expect(new Date(startTime).getTime() - new Date(upcoming.body[0].checkinOpensAt).getTime()).toBe(30 * MIN);
    });

    it('không đến 3 lần trong 30 ngày thì bị khóa đặt lịch online 14 ngày', async () => {
      const p = await createPatient(app, prisma);
      const today = todayVN().getTime();
      for (const daysAgo of [1, 5]) await book(p.patient.id, -daysAgo * DAY / MIN, { date: new Date(today - daysAgo * DAY), status: 'NO_SHOW' });

      const warn = await api(app).get('/api/appointments/standing').set(p.auth).expect(200);
      expect(warn.body).toEqual({ recentNoShows: 2, limit: 3, windowDays: 30, lockedUntil: null });

      await book(p.patient.id, -10 * DAY / MIN, { date: new Date(today - 10 * DAY), status: 'NO_SHOW' });
      const locked = await api(app).get('/api/appointments/standing').set(p.auth).expect(200);
      expect(locked.body.lockedUntil).toBe(new Date(today + 13 * DAY).toISOString().slice(0, 10));

      const start = new Date(Date.now() + DAY);
      const slot = await prisma.schedule.create({
        data: { doctorId: doctor.doctor.id, date: todayVN(start), startTime: start, endTime: new Date(start.getTime() + 15 * MIN) },
      });
      const res = await api(app).post('/api/appointments').set(p.auth).send({ scheduleId: slot.id }).expect(403);
      expect(res.body.message).toMatch(/không đến khám 3 lần trong 30 ngày.*lấy số trực tiếp/);
    });
  });
});
