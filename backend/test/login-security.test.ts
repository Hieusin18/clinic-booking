import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { issueTemporaryPassword } from '../src/auth/accounts.js';
import { AuthService, LOCK_MINUTES, MAX_FAILED_LOGINS, MAX_FAILED_PER_IP } from '../src/auth/auth.service.js';
import { passwordProblem, temporaryPassword } from '../src/auth/password.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser, PASSWORD } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Bảo mật đăng nhập', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  const login = (phone: string, password: string) => api(app).post('/api/auth/login').send({ phone, password });
  const url = () => `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  /** Mở kết nối realtime như app, trả về promise lý do bị ngắt */
  async function openSocket(token: string) {
    const s = io(url(), { path: '/api/socket.io', auth: { token }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', reject);
    });
    const closed = new Promise<string>((r) => s.once('disconnect', (reason) => r(reason)));
    return { s, closed };
  }
  const pushTokens = (userId: string) =>
    prisma.pushToken.findMany({ where: { userId }, select: { token: true }, orderBy: { token: 'asc' } }).then((r) => r.map((t) => t.token));
  const addPush = (auth: object, token: string) =>
    api(app).post('/api/notifications/push-token').set(auth).send({ token, platform: 'ios' }).expect(200);

  it('khóa tài khoản: token đang dùng hết hiệu lực ngay, cả WebSocket', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const doctor = await createDoctor(app, prisma);
    await api(app).get('/api/auth/me').set(doctor.auth).expect(200);
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin.auth).send({ isActive: false }).expect(200);
    const res = await api(app).get('/api/auth/me').set(doctor.auth).expect(401);
    expect(res.body.message).toBe('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');

    const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const socket = io(url, { path: '/api/socket.io', auth: { token: doctor.token }, transports: ['websocket'], reconnection: false });
    const err = await new Promise<{ message: string }>((r) => socket.on('auth:error', r));
    expect(err.message).toMatch(/không hợp lệ/);
    socket.disconnect();
  });

  it(`sai mật khẩu ${MAX_FAILED_LOGINS} lần thì tạm khóa ${LOCK_MINUTES} phút, kể cả nhập đúng; hết hạn khóa thì đăng nhập lại được`, async () => {
    const { user } = await createUser(app, prisma, 'RECEPTIONIST');
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      expect((await login(user.phone, 'sai-mat-khau-1').expect(401)).body.message).toBe('Sai số điện thoại hoặc mật khẩu');
    }
    expect((await login(user.phone, 'sai-mat-khau-1').expect(429)).body.message).toMatch(/Tài khoản tạm khóa 15 phút/);
    expect((await login(user.phone, PASSWORD).expect(429)).body.message).toMatch(/thử lại sau 15 phút/);

    // Hết thời gian khóa
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await login(user.phone, PASSWORD).expect(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toMatchObject({ failedLogins: 0, lockedUntil: null });
    expect(after.lastLoginAt).toBeInstanceOf(Date);
  });

  it('bệnh nhân bị tạm khóa được chỉ tới "Quên mật khẩu", nhân viên được chỉ tới quản trị viên', async () => {
    const patient = await createPatient(app, prisma);
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) await login(patient.user.phone, 'sai-mat-khau-1').expect(401);
    const msg = (await login(patient.user.phone, 'sai-mat-khau-1').expect(429)).body.message as string;
    expect(msg).toMatch(/Quên mật khẩu/);
    expect(msg).not.toMatch(/quản trị viên/);
  });

  it('đăng nhập đúng thì xóa số lần sai trước đó', async () => {
    const { user } = await createUser(app, prisma, 'RECEPTIONIST');
    await login(user.phone, 'sai-mat-khau-1').expect(401);
    await login(user.phone, 'sai-mat-khau-1').expect(401);
    await login(user.phone, PASSWORD).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLogins).toBe(0);
  });

  it(`một địa chỉ IP sai quá ${MAX_FAILED_PER_IP} lần (trên nhiều tài khoản) thì bị chặn`, async () => {
    const auth = app.get(AuthService);
    const now = new Date('2026-11-08T08:00:00Z');
    for (let i = 0; i < MAX_FAILED_PER_IP; i++) {
      await expect(auth.login({ phone: `09${String(i).padStart(8, '0')}`, password: 'x' }, '203.0.113.9', now)).rejects.toMatchObject({ status: 401 });
    }
    await expect(auth.login({ phone: '0911111111', password: 'x' }, '203.0.113.9', now)).rejects.toMatchObject({ status: 429 });
    // IP khác không bị ảnh hưởng; hết 15 phút thì IP cũ thử lại được
    await expect(auth.login({ phone: '0911111111', password: 'x' }, '203.0.113.10', now)).rejects.toMatchObject({ status: 401 });
    const later = new Date(now.getTime() + LOCK_MINUTES * 60_000 + 1000);
    await expect(auth.login({ phone: '0911111111', password: 'x' }, '203.0.113.9', later)).rejects.toMatchObject({ status: 401 });
  });

  it('đổi mật khẩu: kiểm tra mật khẩu cũ và độ mạnh; máy khác bị đăng xuất, máy đang dùng nhận token mới', async () => {
    const patient = await createPatient(app, prisma);
    const otherDevice = (await login(patient.user.phone, PASSWORD).expect(200)).body.accessToken as string;
    const change = (body: object) => api(app).post('/api/auth/change-password').set(patient.auth).send(body);

    expect((await change({ currentPassword: 'sai', newPassword: 'hoaxuan2026' }).expect(400)).body.message).toBe('Mật khẩu hiện tại không đúng');
    expect((await change({ currentPassword: PASSWORD, newPassword: 'abc' }).expect(400)).body.message).toBe('Mật khẩu tối thiểu 8 ký tự');
    const ok = await change({ currentPassword: PASSWORD, newPassword: 'hoaxuan2026' }).expect(200);
    expect(ok.body.user.mustChangePassword).toBe(false);

    await api(app).get('/api/auth/me').set(bearer(otherDevice)).expect(401);
    await api(app).get('/api/auth/me').set(patient.auth).expect(401);
    await api(app).get('/api/auth/me').set(bearer(ok.body.accessToken)).expect(200);
    await login(patient.user.phone, PASSWORD).expect(401);
    await login(patient.user.phone, 'hoaxuan2026').expect(200);
  });

  it('đổi mật khẩu: máy khác thôi nhận thông báo đẩy và bị ngắt realtime; máy đang dùng giữ thông báo, kết nối lại bằng token mới', async () => {
    const patient = await createPatient(app, prisma);
    const other = (await login(patient.user.phone, PASSWORD).expect(200)).body.accessToken as string;
    await addPush(patient.auth, 'ExpoPushToken[may-nay]');
    await addPush(bearer(other), 'ExpoPushToken[may-kia]');
    const here = await openSocket(patient.token);
    const there = await openSocket(other);

    const ok = await api(app)
      .post('/api/auth/change-password')
      .set(patient.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'hoaxuan2026', pushToken: 'ExpoPushToken[may-nay]' })
      .expect(200);
    expect(await pushTokens(patient.user.id)).toEqual(['ExpoPushToken[may-nay]']);
    expect(await there.closed).toBe('io server disconnect');
    // Kết nối của máy này dùng token cũ cũng bị ngắt; kết nối lại bằng token mới thì được
    expect(await here.closed).toBe('io server disconnect');
    const again = await openSocket(ok.body.accessToken);
    expect(again.s.connected).toBe(true);
    again.s.disconnect();
  });

  it('đăng xuất mọi thiết bị', async () => {
    const doctor = await createDoctor(app, prisma);
    const second = (await login(doctor.user.phone, PASSWORD).expect(200)).body.accessToken as string;
    await api(app).post('/api/auth/logout-all').set(doctor.auth).expect(200);
    await api(app).get('/api/auth/me').set(doctor.auth).expect(401);
    await api(app).get('/api/auth/me').set(bearer(second)).expect(401);
  });

  it('đăng xuất mọi thiết bị (bệnh nhân): không máy nào còn nhận thông báo đẩy hay realtime', async () => {
    const patient = await createPatient(app, prisma);
    const second = (await login(patient.user.phone, PASSWORD).expect(200)).body.accessToken as string;
    await addPush(patient.auth, 'ExpoPushToken[a]');
    await addPush(bearer(second), 'ExpoPushToken[b]');
    const socket = await openSocket(second);
    await api(app).post('/api/auth/logout-all').set(patient.auth).expect(200);
    expect(await pushTokens(patient.user.id)).toEqual([]);
    expect(await socket.closed).toBe('io server disconnect');
  });

  it('khóa tài khoản nhân viên đang mở: kết nối realtime bị ngắt ngay', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const reception = await createUser(app, prisma, 'RECEPTIONIST');
    const socket = await openSocket(reception.token);
    await api(app).patch(`/api/staff/receptionists/${reception.user.id}`).set(admin.auth).send({ isActive: false }).expect(200);
    expect(await socket.closed).toBe('io server disconnect');
  });

  it('admin đặt lại mật khẩu bác sĩ: mật khẩu tạm, phải đổi trước khi dùng hệ thống, máy cũ bị đăng xuất', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const doctor = await createDoctor(app, prisma);
    const patient = await createPatient(app, prisma);

    await api(app).post(`/api/users/${doctor.user.id}/reset-password`).set(doctor.auth).expect(403);
    await api(app).post(`/api/users/${patient.user.id}/reset-password`).set(admin.auth).expect(400);
    await api(app).post(`/api/users/${admin.user.id}/reset-password`).set(admin.auth).expect(400);
    const reset = await api(app).post(`/api/users/${doctor.user.id}/reset-password`).set(admin.auth).expect(200);
    const temp = reset.body.temporaryPassword as string;
    expect(temp).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{5}$/);

    await api(app).get('/api/queue/mine').set(doctor.auth).expect(401);
    const session = await login(doctor.user.phone, temp).expect(200);
    expect(session.body.user.mustChangePassword).toBe(true);
    const t = bearer(session.body.accessToken);
    // Chỉ xem được thông tin tài khoản và đổi mật khẩu
    await api(app).get('/api/auth/me').set(t).expect(200);
    const blocked = await api(app).get('/api/doctors/me').set(t).expect(403);
    expect(blocked.body).toMatchObject({ code: 'MUST_CHANGE_PASSWORD' });

    const changed = await api(app).post('/api/auth/change-password').set(t).send({ currentPassword: temp, newPassword: 'binhminh2026' }).expect(200);
    await api(app).get('/api/doctors/me').set(bearer(changed.body.accessToken)).expect(200);
  });

  it('tài khoản admin tạo mới phải đổi mật khẩu ở lần đăng nhập đầu', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const specialty = await prisma.specialty.create({ data: { name: 'Nhi khoa' } });
    await api(app)
      .post('/api/doctors')
      .set(admin.auth)
      .send({ fullName: 'Lê Văn C', phone: '0912345678', password: 'tam-123', specialtyId: specialty.id })
      .expect(201);
    expect((await login('0912345678', 'tam-123').expect(200)).body.user.mustChangePassword).toBe(true);
  });

  it('lệnh trên máy chủ (admin quên mật khẩu) dùng chung cách cấp mật khẩu tạm', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const r = await issueTemporaryPassword(prisma, admin.user.id);
    expect(r.user).toMatchObject({ phone: admin.user.phone, role: 'ADMIN' });
    await api(app).get('/api/auth/me').set(admin.auth).expect(401);
    expect((await login(admin.user.phone, r.temporaryPassword).expect(200)).body.user.mustChangePassword).toBe(true);
  });

  it('quy tắc mật khẩu và mật khẩu tạm', () => {
    expect(passwordProblem('hoaxuan2026')).toBeNull();
    expect(passwordProblem('Mùaxuân2026')).toBeNull();
    expect(passwordProblem('a'.repeat(80) + '1')).toBe('Mật khẩu tối đa 72 ký tự');
    for (let i = 0; i < 50; i++) expect(passwordProblem(temporaryPassword())).toBeNull();
    expect(new Set(Array.from({ length: 50 }, temporaryPassword)).size).toBe(50);
  });
});
