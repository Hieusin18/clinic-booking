import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppointmentReminder, dayWord } from '../src/notifications/appointment-reminder.service.js';
import { ExpoPushClient } from '../src/notifications/expo-push.client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(check()).toBe(true);
};

describe('Thông báo cho bệnh nhân và nhắc lịch', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let patient: Awaited<ReturnType<typeof createPatient>>;
  let reception: { Authorization: string };
  /** Máy chủ Expo Push giả: ghi lại tin được gửi, trả DeviceNotRegistered cho token "chết" */
  let expo: Server;
  const pushed: { to: string; title: string; body: string; data: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    expo = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        const msgs = JSON.parse(raw) as (typeof pushed)[number][];
        pushed.push(...msgs);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            data: msgs.map((m) => (m.to.includes('dead') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' })),
          }),
        );
      });
    });
    await new Promise<void>((r) => expo.listen(0, '127.0.0.1', r));
    app.get(ExpoPushClient).endpoint = `http://127.0.0.1:${(expo.address() as AddressInfo).port}/push`;
  });
  beforeEach(async () => {
    await resetDb(prisma);
    pushed.splice(0);
    doctor = await createDoctor(app, prisma);
    await prisma.doctor.update({ where: { id: doctor.doctor.id }, data: { room: 'Phòng 2' } });
    patient = await createPatient(app, prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
  });
  afterAll(async () => {
    expo.close();
    await app.close();
  });

  const inbox = async (auth = patient.auth) =>
    (await api(app).get('/api/notifications/mine').set(auth).expect(200)).body as {
      items: { id: string; type: string; title: string; body: string; url: string | null; visitId: string | null; readAt: string | null }[];
      unread: number;
    };
  /** Thông báo được gửi sau khi thao tác chính trả về: chờ tới khi hộp thư thỏa điều kiện */
  const inboxUntil = async (check: (b: Awaited<ReturnType<typeof inbox>>) => boolean, auth = patient.auth) => {
    let box = await inbox(auth);
    for (let i = 0; i < 100 && !check(box); i++) {
      await new Promise((r) => setTimeout(r, 20));
      box = await inbox(auth);
    }
    expect(check(box)).toBe(true);
    return box;
  };
  const takeTicket = async () =>
    (await api(app).post('/api/queue/tickets').set(reception).send({ patientId: patient.patient.id, doctorId: doctor.doctor.id }).expect(201)).body
      .id as string;

  it('bác sĩ gọi số: thông báo vào hộp thư, báo qua WebSocket và đẩy về các máy đã đăng ký', async () => {
    await api(app).post('/api/notifications/push-token').set(patient.auth).send({ token: 'ExponentPushToken[may-1]', platform: 'ios' }).expect(200);
    await api(app).post('/api/notifications/push-token').set(patient.auth).send({ token: 'ExponentPushToken[dead]', platform: 'android' }).expect(200);
    const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const socket: Socket = io(url, { path: '/api/socket.io', auth: { token: patient.token }, transports: ['websocket'], reconnection: false });
    const live: Record<string, unknown>[] = [];
    socket.on('notification:new', (n: Record<string, unknown>) => live.push(n));
    await new Promise<void>((r) => socket.once('connect', () => r()));

    const visitId = await takeTicket();
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await until(() => pushed.length === 2);
    socket.disconnect();

    const { items, unread } = await inbox();
    expect(unread).toBe(1);
    expect(items[0]).toMatchObject({ type: 'CALLED', title: 'Đến lượt bạn: số B01', body: 'Mời bạn vào Phòng 2.', url: '/ticket', readAt: null });
    expect(live).toEqual([expect.objectContaining({ id: items[0].id, title: 'Đến lượt bạn: số B01' })]);
    expect(pushed[0]).toMatchObject({ to: 'ExponentPushToken[may-1]', title: 'Đến lượt bạn: số B01', data: { url: '/ticket', type: 'CALLED' } });
    // Token của máy đã gỡ app bị xóa
    for (let i = 0; i < 50 && (await prisma.pushToken.count()) > 1; i++) await new Promise((r) => setTimeout(r, 20));
    expect((await prisma.pushToken.findMany()).map((t) => t.token)).toEqual(['ExponentPushToken[may-1]']);

    await api(app).post(`/api/queue/${visitId}/recall`).set(doctor.auth).expect(200);
    await until(() => pushed.length === 3);
    expect((await inboxUntil((b) => b.items.length === 2)).items[0].title).toBe('Bác sĩ đang gọi lại số B01');
  });

  it('có kết quả cận lâm sàng (quay lại) và khám xong nhận kết quả online đều được báo', async () => {
    // Quay lại đọc kết quả
    const v1 = await takeTicket();
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).put(`/api/visits/${v1}/record`).set(doctor.auth).send({ symptoms: 'Ho', diagnosis: 'Viêm phổi?' }).expect(200);
    const o1 = await api(app).post(`/api/visits/${v1}/lab-orders`).set(doctor.auth).send({ name: 'X-quang ngực' }).expect(201);
    await api(app).post(`/api/visits/${v1}/send-for-tests`).set(doctor.auth).send({ mode: 'RETURN' }).expect(200);
    await api(app).patch(`/api/lab-orders/${o1.body.id}`).set(doctor.auth).send({ resultText: 'Bình thường', done: true }).expect(200);
    await api(app).post(`/api/visits/${v1}/results-ready`).set(doctor.auth).expect(200);
    let box = await inboxUntil((b) => b.items[0]?.type === 'RESULTS_READY');
    expect(box.items[0]).toMatchObject({ type: 'RESULTS_READY', title: 'Đã có kết quả cận lâm sàng', url: '/ticket' });
    expect(box.items[0].body).toMatch(/quay lại Phòng 2/);

    // Gọi vào đọc kết quả rồi hoàn tất: báo đã lưu bệnh án
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).post(`/api/visits/${v1}/complete`).set(doctor.auth).expect(200);
    box = await inboxUntil((b) => b.items[0]?.type === 'VISIT_DONE');
    expect(box.items[0]).toMatchObject({ type: 'VISIT_DONE', title: 'Đã lưu bệnh án lần khám', url: `/visit/${v1}` });

    // Nhận kết quả online: về nhà, bác sĩ trả kết quả và hoàn tất
    const v2 = await takeTicket();
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).put(`/api/visits/${v2}/record`).set(doctor.auth).send({ symptoms: 'Mệt', diagnosis: 'Gan nhiễm mỡ?' }).expect(200);
    const o2 = await api(app).post(`/api/visits/${v2}/lab-orders`).set(doctor.auth).send({ name: 'Siêu âm bụng' }).expect(201);
    await api(app).post(`/api/visits/${v2}/send-for-tests`).set(doctor.auth).send({ mode: 'ONLINE' }).expect(200);
    await api(app).patch(`/api/lab-orders/${o2.body.id}`).set(doctor.auth).send({ resultText: 'Gan nhiễm mỡ độ I', done: true }).expect(200);
    await api(app).post(`/api/visits/${v2}/complete`).set(doctor.auth).expect(200);
    box = await inboxUntil((b) => b.items[0]?.visitId === v2 && b.items[0].type === 'VISIT_DONE');
    expect(box.items[0]).toMatchObject({ type: 'VISIT_DONE', title: 'Đã có kết quả khám', url: `/visit/${v2}` });
    expect(box.items[0].body).toMatch(/kết quả cận lâm sàng, kết luận và đơn thuốc/);
  });

  it('đánh dấu đã đọc theo thông báo, theo lượt khám hoặc tất cả; không đụng tới thông báo của người khác', async () => {
    const other = await createPatient(app, prisma);
    const mk = (userId: string, visitId?: string) => prisma.notification.create({ data: { userId, type: 'VISIT_DONE', title: 't', body: 'b', visitId } });
    const a = await mk(patient.user.id, 'v-a');
    await prisma.notification.create({ data: { userId: patient.user.id, type: 'CALLED', title: 't', body: 'b', visitId: 'v-b' } });
    await mk(patient.user.id, 'v-b');
    await mk(patient.user.id, 'v-b');
    const theirs = await mk(other.user.id);

    expect((await api(app).post('/api/notifications/read').set(patient.auth).send({}).expect(400)).body.message).toMatch(/Chọn thông báo/);
    expect(
      (
        await api(app)
          .post('/api/notifications/read')
          .set(patient.auth)
          .send({ ids: [a.id, theirs.id] })
          .expect(200)
      ).body,
    ).toEqual({ unread: 3 });
    // Mở phiếu số: chỉ tin gọi số của lượt đó
    await api(app)
      .post('/api/notifications/read')
      .set(patient.auth)
      .send({ visitId: 'v-b', types: ['NOPE'] })
      .expect(400);
    expect(
      (
        await api(app)
          .post('/api/notifications/read')
          .set(patient.auth)
          .send({ visitId: 'v-b', types: ['CALLED'] })
          .expect(200)
      ).body,
    ).toEqual({ unread: 2 });
    expect((await api(app).post('/api/notifications/read').set(patient.auth).send({ visitId: 'v-b' }).expect(200)).body).toEqual({ unread: 0 });
    expect((await inbox(other.auth)).unread).toBe(1);
    expect((await api(app).post('/api/notifications/read').set(other.auth).send({ all: true }).expect(200)).body).toEqual({ unread: 0 });
    // Nhân viên không có hộp thư
    await api(app).get('/api/notifications/mine').set(doctor.auth).expect(403);
  });

  it('token đẩy: kiểm tra định dạng, chuyển sang tài khoản mới khi máy đổi người dùng, xóa khi đăng xuất', async () => {
    await api(app).post('/api/notifications/push-token').set(patient.auth).send({ token: 'abc', platform: 'ios' }).expect(400);
    await api(app).post('/api/notifications/push-token').set(patient.auth).send({ token: 'ExpoPushToken[x]', platform: 'web' }).expect(400);
    await api(app).post('/api/notifications/push-token').set(doctor.auth).send({ token: 'ExpoPushToken[x]', platform: 'ios' }).expect(403);
    await api(app).post('/api/notifications/push-token').set(patient.auth).send({ token: 'ExpoPushToken[x]', platform: 'ios' }).expect(200);
    const other = await createPatient(app, prisma);
    await api(app).post('/api/notifications/push-token').set(other.auth).send({ token: 'ExpoPushToken[x]', platform: 'ios' }).expect(200);
    expect(await prisma.pushToken.findMany({ select: { userId: true } })).toEqual([{ userId: other.user.id }]);
    // Người cũ không xóa được token đã chuyển sang người khác
    await api(app).post('/api/notifications/push-token/remove').set(patient.auth).send({ token: 'ExpoPushToken[x]' }).expect(200);
    expect(await prisma.pushToken.count()).toBe(1);
    await api(app).post('/api/notifications/push-token/remove').set(other.auth).send({ token: 'ExpoPushToken[x]' }).expect(200);
    expect(await prisma.pushToken.count()).toBe(0);
  });

  it('nhắc lịch trước một ngày và trước một giờ, mỗi mốc một lần; không nhắc lịch đặt sát giờ, đã hủy hoặc đã check-in', async () => {
    const reminder = app.get(AppointmentReminder);
    const start = new Date('2026-11-20T02:00:00Z'); // 09:00 giờ Việt Nam
    const book = async (createdAt: Date, status: 'PENDING' | 'CANCELLED' = 'PENDING') => {
      const d = await createDoctor(app, prisma);
      await prisma.doctor.update({ where: { id: d.doctor.id }, data: { room: 'Phòng 2' } });
      const schedule = await prisma.schedule.create({
        data: { doctorId: d.doctor.id, date: new Date('2026-11-20'), startTime: start, endTime: new Date(start.getTime() + 30 * MINUTE), isBooked: true },
      });
      return prisma.appointment.create({ data: { patientId: patient.patient.id, scheduleId: schedule.id, createdAt, status } });
    };
    const early = await book(new Date('2026-11-10T00:00:00Z'));
    // Đặt 3 giờ trước giờ hẹn: không nhắc trước một ngày, vẫn nhắc trước một giờ
    const late = await book(new Date(start.getTime() - 3 * HOUR));
    await book(new Date('2026-11-10T00:00:00Z'), 'CANCELLED');
    // Đã check-in (có phiếu khám) thì thôi nhắc
    const arrived = await book(new Date('2026-11-10T00:00:00Z'));
    const sched = await prisma.schedule.findFirstOrThrow({ where: { appointments: { some: { id: arrived.id } } } });
    await prisma.visit.create({
      data: {
        patientId: patient.patient.id,
        doctorId: sched.doctorId,
        date: new Date('2026-11-20'),
        queueNumber: 1,
        source: 'ONLINE',
        checkinMethod: 'QR',
        appointmentId: arrived.id,
      },
    });

    // Còn hơn 24 giờ: chưa nhắc
    expect(await reminder.sweep(new Date(start.getTime() - 25 * HOUR))).toBe(0);
    // Còn 23 giờ: nhắc trước một ngày (chỉ lịch đặt sớm), chạy lại không gửi trùng
    expect(await reminder.sweep(new Date(start.getTime() - 23 * HOUR))).toBe(1);
    expect(await reminder.sweep(new Date(start.getTime() - 22 * HOUR))).toBe(0);
    let box = await inbox();
    expect(box.items[0]).toMatchObject({ type: 'APPOINTMENT_REMINDER', title: 'Nhắc lịch khám ngày mai lúc 09:00', url: '/appointments' });
    expect(box.items[0].body).toMatch(/^09:00 với bác sĩ .+ \(Phòng 2\)\. Đến quầy quét mã QR để check-in từ 08:30 đến 09:15; quá giờ lịch hẹn sẽ bị hủy\.$/);

    // Còn 45 phút: nhắc trước một giờ cho cả hai lịch còn hiệu lực
    expect(await reminder.sweep(new Date(start.getTime() - 45 * MINUTE))).toBe(2);
    expect(await reminder.sweep(new Date(start.getTime() - 30 * MINUTE))).toBe(0);
    box = await inbox();
    expect(box.items.slice(0, 2).map((n) => n.title)).toEqual(['Còn 45 phút nữa tới giờ khám', 'Còn 45 phút nữa tới giờ khám']);
    expect(box.unread).toBe(3);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: late.id } })).remindedDayAt).toBeNull();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: early.id } })).remindedHourAt).not.toBeNull();
  });

  it('ghi ngày nhắc theo giờ Việt Nam', () => {
    const start = new Date('2026-11-20T02:00:00Z');
    expect(dayWord(start, new Date('2026-11-19T03:00:00Z'))).toBe('ngày mai');
    expect(dayWord(start, new Date('2026-11-20T00:00:00Z'))).toBe('hôm nay');
    expect(dayWord(start, new Date('2026-11-17T03:00:00Z'))).toBe('ngày 20/11');
  });
});
