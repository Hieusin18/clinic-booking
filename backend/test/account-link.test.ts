import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountLinkService, MAX_VERIFY_FAILURES } from '../src/patients/account-link.service.js';
import { newLinkCode, normalizeCode } from '../src/patients/utils/link-code.util.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const PHONE = '0987000111';
const register = { fullName: 'Người Đăng Ký', phone: PHONE, password: 'xuanhoa2026', dateOfBirth: '1980-02-02', gender: 'FEMALE' };

describe('Liên kết tài khoản app với hồ sơ có sẵn', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reception: { Authorization: string };
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let patientId: string;
  let oldVisitId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  /** Bà A khám vãng lai (lễ tân tạo hồ sơ, có bệnh án), chưa có tài khoản app */
  beforeEach(async () => {
    await resetDb(prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
    doctor = await createDoctor(app, prisma);
    const p = await api(app)
      .post('/api/patients')
      .set(reception)
      .send({
        fullName: 'Nguyễn Thị A',
        phone: PHONE,
        dateOfBirth: '1975-05-05',
        gender: 'FEMALE',
        nationalId: '001175000111',
        allergies: 'Penicillin',
        address: '12 Láng Hạ',
      })
      .expect(201);
    patientId = p.body.id;
    const v = await api(app).post('/api/queue/tickets').set(reception).send({ patientId, doctorId: doctor.doctor.id }).expect(201);
    oldVisitId = v.body.id;
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).put(`/api/visits/${oldVisitId}/record`).set(doctor.auth).send({ symptoms: 'Ho', diagnosis: 'Viêm phế quản' }).expect(200);
    await api(app).post(`/api/visits/${oldVisitId}/complete`).set(doctor.auth).expect(200);
  });
  afterAll(() => app.close());

  const signUp = async () => {
    const res = await api(app).post('/api/auth/register').send(register).expect(201);
    return { Authorization: `Bearer ${res.body.accessToken}` };
  };

  it('đăng ký bằng số của hồ sơ có sẵn: dùng được app nhưng không thấy bệnh án cũ, thông tin cá nhân bị che, không sửa được', async () => {
    const auth = await signUp();
    expect(await api(app).get('/api/visits/mine').set(auth).expect(200)).toMatchObject({ body: [] });
    await api(app).get(`/api/visits/${oldVisitId}`).set(auth).expect(404);
    await api(app).get(`/api/visits/${oldVisitId}/record.pdf`).set(auth).expect(404);
    await api(app).get(`/api/queue/${oldVisitId}/position`).set(auth).expect(404);

    const me = (await api(app).get('/api/patients/me').set(auth).expect(200)).body;
    expect(me).toMatchObject({ fullName: 'Nguyễn Thị A', verified: false, nationalId: null, allergies: null, address: null });
    expect(me.linkCode).toBeUndefined();
    expect((await api(app).patch('/api/patients/me').set(auth).send({ allergies: 'Không' }).expect(403)).body.message).toMatch(/xác minh hồ sơ/);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).allergies).toBe('Penicillin');

    expect((await api(app).get('/api/patients/me/link').set(auth).expect(200)).body).toEqual({ verified: false, hiddenVisits: 1 });

    // Thông tin tài khoản cũng không để lộ mã liên kết hay thông tin cá nhân của hồ sơ
    const account = (await api(app).get('/api/auth/me').set(auth).expect(200)).body;
    expect(account.patient).toMatchObject({ id: patientId, verified: false });
    for (const f of ['linkCode', 'nationalId', 'address', 'allergies']) expect(account.patient).not.toHaveProperty(f);
    expect(JSON.stringify(account)).not.toMatch(/001175000111|Penicillin|Láng Hạ/);

    // Lượt khám mới sau khi đăng ký thì thấy, nhưng không kèm dị ứng của hồ sơ
    const v2 = await api(app).post('/api/queue/tickets').set(reception).send({ patientId, doctorId: doctor.doctor.id }).expect(201);
    const queue = (await api(app).get('/api/queue/mine').set(auth).expect(200)).body;
    expect(queue.map((v: { id: string }) => v.id)).toEqual([v2.body.id]);
    expect(JSON.stringify(queue)).not.toContain('Penicillin');
    // Nhân viên vẫn thấy dị ứng trên phiếu
    expect(v2.body.patient.allergies).toBe('Penicillin');
    // Bản tự tải của lượt mới không in thông tin cá nhân của hồ sơ
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).put(`/api/visits/${v2.body.id}/record`).set(doctor.auth).send({ symptoms: 'Sốt', diagnosis: 'Cảm cúm' }).expect(200);
    const html = (await api(app).get(`/api/visits/${v2.body.id}/record.html`).set(auth).expect(200)).text;
    expect(html).not.toContain('001175000111');
    expect(html).not.toContain('12 Láng Hạ');
  });

  it('nhập đúng mã liên kết (in trên bản bác sĩ in, lễ tân xem được) thì thấy lại toàn bộ', async () => {
    const auth = await signUp();
    const account = (await api(app).get(`/api/patients/${patientId}/account`).set(reception).expect(200)).body;
    expect(account).toMatchObject({ status: 'UNVERIFIED', linkCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/) });

    // Bản bác sĩ in có mã; bản bệnh nhân tự tải thì không
    const doctorHtml = (await api(app).get(`/api/visits/${oldVisitId}/record.html`).set(doctor.auth).expect(200)).text;
    expect(doctorHtml).toContain(`nhập mã liên kết ${account.linkCode}`);

    const code = `${account.linkCode.slice(0, 3).toLowerCase()} ${account.linkCode.slice(3)}`;
    expect((await api(app).post('/api/patients/me/verify').set(auth).send({ code }).expect(200)).body).toEqual({ verified: true, hiddenVisits: 0 });
    expect((await api(app).get('/api/visits/mine').set(auth).expect(200)).body.map((v: { id: string }) => v.id)).toEqual([oldVisitId]);
    expect((await api(app).get('/api/patients/me').set(auth).expect(200)).body).toMatchObject({ verified: true, allergies: 'Penicillin' });
    expect((await api(app).get(`/api/patients/${patientId}/account`).set(reception).expect(200)).body.status).toBe('VERIFIED');
    const html = (await api(app).get(`/api/visits/${oldVisitId}/record.html`).set(auth).expect(200)).text;
    expect(html).not.toContain(account.linkCode);
  });

  it(`sai mã ${MAX_VERIFY_FAILURES} lần thì khóa nhập mã 60 phút`, async () => {
    const auth = await signUp();
    for (let i = 1; i < MAX_VERIFY_FAILURES; i++) {
      expect((await api(app).post('/api/patients/me/verify').set(auth).send({ code: 'ZZZZZZ' }).expect(400)).body.message).toBe('Mã liên kết không đúng');
    }
    expect((await api(app).post('/api/patients/me/verify').set(auth).send({ code: 'ZZZZZZ' }).expect(400)).body.message).toMatch(/thử lại sau 60 phút/);
    const { linkCode } = (await api(app).get(`/api/patients/${patientId}/account`).set(reception).expect(200)).body;
    expect((await api(app).post('/api/patients/me/verify').set(auth).send({ code: linkCode }).expect(429)).body.message).toMatch(/nhờ lễ tân xác minh/);
  });

  it('lễ tân xác minh tại quầy (đã xem CCCD)', async () => {
    const auth = await signUp();
    await api(app).post(`/api/patients/${patientId}/account/verify`).set(doctor.auth).expect(403);
    expect((await api(app).post(`/api/patients/${patientId}/account/verify`).set(reception).expect(200)).body.status).toBe('VERIFIED');
    expect((await api(app).get('/api/patients/me/link').set(auth).expect(200)).body).toEqual({ verified: true, hiddenVisits: 0 });
  });

  it('người lạ đăng ký trước bằng số của bà A: lễ tân gỡ tài khoản đó, bà A đăng ký lại được', async () => {
    const squatter = await signUp();
    const detached = (await api(app).post(`/api/patients/${patientId}/account/detach`).set(reception).expect(200)).body;
    expect(detached.status).toBe('NONE');
    await api(app).get('/api/auth/me').set(squatter).expect(401);
    await api(app).post('/api/auth/login').send({ phone: PHONE, password: register.password }).expect(401);

    const owner = await signUp();
    await api(app).post(`/api/patients/${patientId}/account/verify`).set(reception).expect(200);
    expect((await api(app).get('/api/visits/mine').set(owner).expect(200)).body).toHaveLength(1);
    // Đã xác minh là chính chủ thì không gỡ được
    await api(app).post(`/api/patients/${patientId}/account/detach`).set(reception).expect(409);
  });

  it('đăng ký số mới (không có hồ sơ sẵn) thì không bị khóa gì', async () => {
    const res = await api(app)
      .post('/api/auth/register')
      .send({ ...register, phone: '0987000222' })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await api(app).get('/api/patients/me/link').set(auth).expect(200)).body).toEqual({ verified: true, hiddenVisits: 0 });
    expect((await api(app).get('/api/patients/me').set(auth).expect(200)).body.verified).toBe(true);
  });

  it('mã liên kết: không có ký tự dễ nhầm, mỗi hồ sơ một mã cố định', async () => {
    for (let i = 0; i < 100; i++) expect(newLinkCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(normalizeCode(' ab3-x9k ')).toBe('AB3X9K');
    const svc = app.get(AccountLinkService);
    const a = await svc.accountOf(patientId);
    const b = await svc.accountOf(patientId);
    expect(a.linkCode).toBe(b.linkCode);
    expect(a.status).toBe('NONE');
  });
});
