import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const register = {
  fullName: 'Nguyễn Thị Hoa',
  phone: '0987654321',
  password: 'matkhau1',
  dateOfBirth: '1998-03-20',
  gender: 'FEMALE',
};

describe('Tài khoản và phân quyền', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => resetDb(prisma));
  afterAll(async () => app.close());

  describe('Đăng ký', () => {
    it('tạo tài khoản bệnh nhân kèm hồ sơ và trả về token', async () => {
      const res = await api(app).post('/api/auth/register').send(register).expect(201);
      expect(res.body.accessToken).toBeTypeOf('string');
      expect(res.body.user).toMatchObject({ phone: register.phone, role: 'PATIENT' });
      expect(res.body.user.passwordHash).toBeUndefined();
      const patient = await prisma.patient.findUnique({ where: { phone: register.phone } });
      expect(patient?.userId).toBe(res.body.user.id);
    });

    it('không lưu mật khẩu dạng chữ thường', async () => {
      await api(app).post('/api/auth/register').send(register).expect(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { phone: register.phone } });
      expect(user.passwordHash).not.toContain(register.password);
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('trả 409 khi SĐT đã có tài khoản', async () => {
      await api(app).post('/api/auth/register').send(register).expect(201);
      const res = await api(app).post('/api/auth/register').send(register).expect(409);
      expect(res.body.message).toBe('Số điện thoại đã được đăng ký');
    });

    it('gắn tài khoản vào hồ sơ lễ tân đã tạo trước với cùng SĐT', async () => {
      const walkIn = await prisma.patient.create({
        data: { fullName: 'Nguyễn Thị Hoa', phone: register.phone, dateOfBirth: new Date('1998-03-20'), gender: 'FEMALE' },
      });
      const res = await api(app).post('/api/auth/register').send(register).expect(201);
      const linked = await prisma.patient.findUniqueOrThrow({ where: { id: walkIn.id } });
      expect(linked.userId).toBe(res.body.user.id);
      expect(await prisma.patient.count()).toBe(1);
    });

    it('trả 400 với SĐT sai định dạng và mật khẩu quá ngắn', async () => {
      const res = await api(app)
        .post('/api/auth/register')
        .send({ ...register, phone: '12345', password: '1' })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining(['Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0', 'Mật khẩu tối thiểu 6 ký tự']),
      );
    });
  });

  describe('Đăng nhập', () => {
    beforeEach(async () => {
      await api(app).post('/api/auth/register').send(register).expect(201);
    });

    it('đúng mật khẩu trả về token, dùng được cho /auth/me', async () => {
      const res = await api(app).post('/api/auth/login').send({ phone: register.phone, password: register.password }).expect(200);
      const me = await api(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
      expect(me.body).toMatchObject({ phone: register.phone, role: 'PATIENT' });
      expect(me.body.patient.fullName).toBe(register.fullName);
    });

    it('sai mật khẩu trả 401', async () => {
      const res = await api(app).post('/api/auth/login').send({ phone: register.phone, password: 'sai-mat-khau' }).expect(401);
      expect(res.body.message).toBe('Sai số điện thoại hoặc mật khẩu');
    });

    it('tài khoản bị khóa không đăng nhập được', async () => {
      await prisma.user.update({ where: { phone: register.phone }, data: { isActive: false } });
      await api(app).post('/api/auth/login').send({ phone: register.phone, password: register.password }).expect(401);
    });
  });

  describe('Guard phân quyền', () => {
    it('không có token trả 401', async () => {
      await api(app).get('/api/auth/me').expect(401);
    });

    it('token giả trả 401', async () => {
      await api(app).get('/api/auth/me').set('Authorization', 'Bearer khong-hop-le').expect(401);
    });

    it('sai vai trò trả 403', async () => {
      const patient = await createUser(app, prisma, 'PATIENT');
      const res = await api(app).get('/api/qr/current').set(patient.auth).expect(403);
      expect(res.body.message).toBe('Bạn không có quyền thực hiện thao tác này');
    });

    it('đúng vai trò thì gọi được', async () => {
      const receptionist = await createUser(app, prisma, 'RECEPTIONIST');
      const res = await api(app).get('/api/qr/current').set(receptionist.auth).expect(200);
      expect(res.body.token).toBeTypeOf('string');
    });

    it('API công khai không cần token', async () => {
      await api(app).get('/api/health').expect(200);
      await api(app).get('/api/specialties').expect(200);
    });
  });
});
