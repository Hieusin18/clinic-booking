import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

describe('Cập nhật tức thì qua WebSocket và loa gọi số', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  beforeEach(async () => resetDb(prisma));
  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));
  afterAll(async () => app.close());

  /** Kết nối như web/app: đường dẫn /api/socket.io, token trong auth. */
  async function connect(token?: string) {
    const s = io(url, { path: '/api/socket.io', auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', reject);
    });
    return s;
  }
  /** Gom mọi sự kiện một socket nhận được. */
  const record = (s: Socket) => {
    const got: [string, Record<string, unknown>][] = [];
    s.onAny((event: string, payload: Record<string, unknown>) => got.push([event, payload]));
    return got;
  };
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(check()).toBe(true);
  };

  it('không có token hợp lệ thì bị ngắt kết nối', async () => {
    const s = io(url, { path: '/api/socket.io', auth: { token: 'sai' }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    const reason = await new Promise<string>((resolve) => {
      s.on('auth:error', () => undefined);
      s.on('disconnect', (r) => resolve(r));
    });
    expect(reason).toBe('io server disconnect');
  });

  it('lấy số → nhân viên nhận queue:changed; gọi số → loa (queue:called kèm phòng) và app bệnh nhân (visit:called)', async () => {
    const doctor = await createDoctor(app, prisma);
    await prisma.doctor.update({ where: { id: doctor.doctor.id }, data: { room: 'Phòng 2' } });
    const reception = await createUser(app, prisma, 'RECEPTIONIST');
    const patient = await createPatient(app, prisma);
    const other = await createPatient(app, prisma);

    const staff = record(await connect(reception.token));
    const mine = record(await connect(patient.token));
    const notMine = record(await connect(other.token));

    const ticket = await api(app)
      .post('/api/queue/tickets')
      .set(reception.auth)
      .send({ patientId: patient.patient.id, doctorId: doctor.doctor.id })
      .expect(201);
    await until(() => staff.some(([e]) => e === 'queue:changed'));
    await until(() => mine.some(([e, p]) => e === 'visit:changed' && p.status === 'WAITING'));

    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await until(() => staff.some(([e]) => e === 'queue:called'));
    expect(staff.find(([e]) => e === 'queue:called')![1]).toMatchObject({ visitId: ticket.body.id, label: 'B01', room: 'Phòng 2', doctorFullName: expect.any(String), recall: false });
    await until(() => mine.some(([e]) => e === 'visit:called'));
    expect(mine.find(([e]) => e === 'visit:called')![1]).toMatchObject({ label: 'B01', room: 'Phòng 2' });

    // Bệnh nhân khác không nhận sự kiện của người khác; bệnh nhân không nhận sự kiện dành cho nhân viên
    expect(notMine).toEqual([]);
    expect(mine.some(([e]) => e.startsWith('queue:'))).toBe(false);
  });

  it('bác sĩ gọi lại số đang khám: loa đọc lại; số không đang khám thì không gọi lại được', async () => {
    const doctor = await createDoctor(app, prisma);
    const reception = await createUser(app, prisma, 'RECEPTIONIST');
    const patient = await createPatient(app, prisma);
    const staff = record(await connect(reception.token));
    const ticket = await api(app)
      .post('/api/queue/tickets')
      .set(reception.auth)
      .send({ patientId: patient.patient.id, doctorId: doctor.doctor.id })
      .expect(201);
    await api(app).post(`/api/queue/${ticket.body.id}/recall`).set(doctor.auth).expect(409);
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).post(`/api/queue/${ticket.body.id}/recall`).set(doctor.auth).expect(200);
    await until(() => staff.some(([e, p]) => e === 'queue:called' && p.recall === true));
    const someoneElse = await createDoctor(app, prisma);
    await api(app).post(`/api/queue/${ticket.body.id}/recall`).set(someoneElse.auth).expect(404);
  });

  it('admin đặt phòng khám cho bác sĩ; bệnh nhân thấy phòng trong hồ sơ bác sĩ', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const doctor = await createDoctor(app, prisma);
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin.auth).send({ room: '  Phòng 5 ' }).expect(200);
    expect((await api(app).get(`/api/doctors/${doctor.doctor.id}`).expect(200)).body.room).toBe('Phòng 5');
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin.auth).send({ room: '' }).expect(200);
    expect((await api(app).get(`/api/doctors/${doctor.doctor.id}`).expect(200)).body.room).toBeNull();
  });
});
