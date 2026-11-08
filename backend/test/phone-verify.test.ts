import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { codeIn, MAX_PER_PHONE_HOUR, normalizePhone, PhoneVerifyService } from '../src/sms/phone-verify.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const PHONE = '0912345678';
const TOKEN = 'iphone-shortcut-secret-for-test';
const KEY = 'android-signing-key-for-test';
const register = { fullName: 'Trần Văn B', phone: PHONE, password: 'xuanhoa2026', dateOfBirth: '1990-01-01', gender: 'MALE' };

describe('Xác minh số điện thoại bằng tin nhắn người dùng gửi đến', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.SMS_GATEWAY_TOKEN = TOKEN;
    process.env.SMS_GATEWAY_SIGNING_KEY = KEY;
    process.env.SMS_VERIFY_NUMBER = '0988000999';
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDb(prisma);
    process.env.REQUIRE_PHONE_VERIFICATION = 'true';
  });
  afterEach(() => {
    process.env.REQUIRE_PHONE_VERIFICATION = 'false';
  });
  afterAll(() => app.close());

  const start = async (phone = PHONE, purpose = 'REGISTER') =>
    (await api(app).post('/api/auth/phone-verifications').send({ phone, purpose }).expect(201)).body as {
      id: string;
      ticket: string;
      code: string;
      smsTo: string;
      smsBody: string;
    };
  const status = async (v: { id: string; ticket: string }) =>
    (await api(app).get(`/api/auth/phone-verifications/${v.id}`).query({ ticket: v.ticket }).expect(200)).body.status as string;
  const fromIphone = (from: string, body: string) => api(app).post('/api/sms/inbound').set('X-Gateway-Token', TOKEN).send({ from, body });

  it('đăng ký: nhắn mã từ đúng số (qua iPhone Phím tắt) thì xác minh, rồi đăng ký được', async () => {
    const v = await start();
    expect(v).toMatchObject({ smsTo: '0988000999', smsBody: `PKXM ${v.code}` });
    expect(v.code).toMatch(/^\d{6}$/);
    expect(await status(v)).toBe('PENDING');

    // Không xác minh thì không đăng ký được
    expect((await api(app).post('/api/auth/register').send(register).expect(400)).body.message).toMatch(/chưa được xác minh/);
    expect(
      (
        await api(app)
          .post('/api/auth/register')
          .send({ ...register, verificationId: v.id, ticket: v.ticket })
          .expect(400)
      ).body.message,
    ).toMatch(/chưa được xác minh/);

    const res = await fromIphone('+84 912 345 678', `pkxm ${v.code}`).expect(200);
    expect(res.body).toEqual({ ok: true, result: 'VERIFIED' });
    expect(await status(v)).toBe('VERIFIED');

    await api(app)
      .post('/api/auth/register')
      .send({ ...register, verificationId: v.id, ticket: v.ticket })
      .expect(201);
    // Phiên đã dùng thì không dùng lại được
    await api(app)
      .post('/api/auth/register')
      .send({ ...register, phone: '0912345679', verificationId: v.id, ticket: v.ticket })
      .expect(400);
  });

  it('kẻ xấu khai số của người khác: tin nhắn từ SIM của hắn bị từ chối', async () => {
    const v = await start();
    expect((await fromIphone('0909999999', `PKXM ${v.code}`).expect(200)).body.result).toBe('WRONG_SENDER');
    // Người gửi là email (iMessage) thì không chứng minh được số
    expect((await fromIphone('ke-xau@icloud.com', `PKXM ${v.code}`).expect(200)).body.result).toBe('INVALID_SENDER');
    expect((await fromIphone(PHONE, 'PKXM 000000').expect(200)).body.result).toBe('NO_MATCH');
    expect(await status(v)).toBe('PENDING');
    // Không có vé thì không xem được trạng thái của phiên người khác
    await api(app).get(`/api/auth/phone-verifications/${v.id}`).query({ ticket: 'doan-bua' }).expect(404);
    const log = await prisma.inboundSms.findMany({ orderBy: { receivedAt: 'asc' } });
    expect(log.map((m) => [m.source, m.result])).toEqual([
      ['IOS_SHORTCUT', 'WRONG_SENDER'],
      ['IOS_SHORTCUT', 'INVALID_SENDER'],
      ['IOS_SHORTCUT', 'NO_MATCH'],
    ]);
  });

  it('cổng SMS phải xác thực: sai mã bí mật hoặc không có thì 401; Android ký HMAC thì nhận', async () => {
    const v = await start();
    await api(app)
      .post('/api/sms/inbound')
      .send({ from: PHONE, body: `PKXM ${v.code}` })
      .expect(401);
    await api(app)
      .post('/api/sms/inbound')
      .set('X-Gateway-Token', 'sai')
      .send({ from: PHONE, body: `PKXM ${v.code}` })
      .expect(401);

    const body = JSON.stringify({
      event: 'sms:received',
      payload: { messageId: 'm1', message: `PKXM ${v.code}`, phoneNumber: '+84912345678', simNumber: 1, receivedAt: '2026-11-08T10:00:00.000+07:00' },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const sign = (k: string, t = ts) =>
      createHmac('sha256', k)
        .update(body + t)
        .digest('hex');
    const send = (sig: string, t = ts) =>
      api(app).post('/api/sms/inbound').set('Content-Type', 'application/json').set('X-Signature', sig).set('X-Timestamp', t).send(body);
    await send(sign('khoa-sai')).expect(401);
    const old = String(Number(ts) - 600);
    await send(sign(KEY, old), old).expect(401);
    expect((await send(sign(KEY)).expect(200)).body.result).toBe('VERIFIED');
    expect(await status(v)).toBe('VERIFIED');
  });

  it('admin xem cấu hình cổng và tin đã nhận; không ai khác xem được', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const v = await start();
    await fromIphone(PHONE, `PKXM ${v.code}`).expect(200);
    await api(app)
      .get('/api/sms/inbound')
      .set((await createUser(app, prisma, 'RECEPTIONIST')).auth)
      .expect(403);
    expect((await api(app).get('/api/sms/inbound').set(admin.auth).expect(200)).body[0]).toMatchObject({
      source: 'IOS_SHORTCUT',
      result: 'VERIFIED',
      phone: PHONE,
    });
    expect((await api(app).get('/api/sms/config').set(admin.auth).expect(200)).body).toEqual({
      smsTo: '0988000999',
      iphoneShortcut: true,
      androidGateway: true,
      prefix: 'PKXM',
    });
    // Không còn chế độ giả lập
    await api(app).post('/api/sms/simulate').set(admin.auth).send({ from: PHONE, body: v.code }).expect(404);
  });

  it('đăng ký bằng số của hồ sơ có sẵn: đã chứng minh giữ số thì thấy ngay lịch sử khám', async () => {
    const reception = await createUser(app, prisma, 'RECEPTIONIST');
    const p = await api(app)
      .post('/api/patients')
      .set(reception.auth)
      .send({ fullName: 'Trần Văn B', phone: PHONE, dateOfBirth: '1990-01-01', gender: 'MALE' })
      .expect(201);
    const v = await start();
    await fromIphone(PHONE, `PKXM ${v.code}`).expect(200);
    const res = await api(app)
      .post('/api/auth/register')
      .send({ ...register, verificationId: v.id, ticket: v.ticket })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await api(app).get('/api/patients/me/link').set(auth).expect(200)).body).toEqual({ verified: true, hiddenVisits: 0 });
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: p.body.id } })).verifiedAt).toBeInstanceOf(Date);
  });

  it('quên mật khẩu: xác minh số bằng tin nhắn rồi đặt mật khẩu mới, các máy khác bị đăng xuất', async () => {
    process.env.REQUIRE_PHONE_VERIFICATION = 'false';
    const old = await api(app).post('/api/auth/register').send(register).expect(201);
    process.env.REQUIRE_PHONE_VERIFICATION = 'true';

    // Số chưa có tài khoản / số của nhân viên / đăng ký trùng
    await api(app).post('/api/auth/phone-verifications').send({ phone: '0999999999', purpose: 'RESET_PASSWORD' }).expect(404);
    const staff = await createUser(app, prisma, 'DOCTOR');
    await api(app).post('/api/auth/phone-verifications').send({ phone: staff.user.phone, purpose: 'RESET_PASSWORD' }).expect(400);
    await api(app).post('/api/auth/phone-verifications').send({ phone: PHONE, purpose: 'REGISTER' }).expect(409);

    const v = await start(PHONE, 'RESET_PASSWORD');
    // Chưa nhắn tin thì không đặt được
    await api(app).post('/api/auth/reset-password').send({ verificationId: v.id, ticket: v.ticket, newPassword: 'muadong2026' }).expect(400);
    await fromIphone(PHONE, `PKXM ${v.code}`).expect(200);
    expect(
      (await api(app).post('/api/auth/reset-password').send({ verificationId: v.id, ticket: 'sai', newPassword: 'muadong2026' }).expect(400)).body.message,
    ).toMatch(/xác minh lại/);
    expect(
      (await api(app).post('/api/auth/reset-password').send({ verificationId: v.id, ticket: v.ticket, newPassword: 'abc' }).expect(400)).body.message,
    ).toBe('Mật khẩu tối thiểu 8 ký tự');
    const done = await api(app).post('/api/auth/reset-password').send({ verificationId: v.id, ticket: v.ticket, newPassword: 'muadong2026' }).expect(200);
    expect(done.body.user.phone).toBe(PHONE);
    await api(app)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${old.body.accessToken}` })
      .expect(401);
    await api(app).post('/api/auth/login').send({ phone: PHONE, password: 'muadong2026' }).expect(200);
    // Mỗi phiên chỉ dùng một lần
    await api(app).post('/api/auth/reset-password').send({ verificationId: v.id, ticket: v.ticket, newPassword: 'muaha2026x' }).expect(400);
  });

  it('giới hạn số phiên theo số điện thoại; phiên hết hạn', async () => {
    for (let i = 0; i < MAX_PER_PHONE_HOUR; i++) await start();
    await api(app).post('/api/auth/phone-verifications').send({ phone: PHONE, purpose: 'REGISTER' }).expect(429);

    const svc = app.get(PhoneVerifyService);
    await prisma.phoneVerification.deleteMany();
    const v = await start('0912000111');
    await prisma.phoneVerification.update({ where: { id: v.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await status(v)).toBe('EXPIRED');
    expect((await svc.handleInbound('IOS_SHORTCUT', '0912000111', `PKXM ${v.code}`)).result).toBe('NO_MATCH');
  });

  it('chuẩn hóa số người gửi và tìm mã trong tin', () => {
    expect(normalizePhone('+84 912 345 678')).toBe('0912345678');
    expect(normalizePhone('84912345678')).toBe('0912345678');
    expect(normalizePhone('0912-345-678')).toBe('0912345678');
    expect(normalizePhone('Mẹ')).toBeNull();
    expect(normalizePhone('a@b.com')).toBeNull();
    expect(codeIn('PKXM 482913')).toBe('482913');
    expect(codeIn('pkxm482913')).toBe('482913');
    expect(codeIn('Mã của tôi là 004213 nhé')).toBe('004213');
    expect(codeIn('PKXM 12345')).toBeNull();
    expect(codeIn('1234567')).toBeNull();
  });
});
