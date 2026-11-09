import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uniqueMessage } from '../src/common/unique-error.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const patient = (phone: string, email?: string) => ({
  fullName: 'Người Đăng Ký',
  phone,
  password: 'xuanhoa2026',
  dateOfBirth: '1990-01-01',
  gender: 'MALE',
  ...(email ? { email } : {}),
});

describe('Dữ liệu trùng trả 409 kèm lý do, không phải lỗi 500', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  it('đăng ký bằng email đã có người dùng', async () => {
    await api(app).post('/api/auth/register').send(patient('0987000222', 'a@b.vn')).expect(201);
    const res = await api(app).post('/api/auth/register').send(patient('0987000333', 'a@b.vn')).expect(409);
    expect(res.body.message).toBe('Email đã được dùng cho tài khoản khác');
    // Không để lại tài khoản dở dang
    expect(await prisma.user.count({ where: { phone: '0987000333' } })).toBe(0);
  });

  it('admin tạo lễ tân / bác sĩ trùng email', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    await prisma.user.update({ where: { id: admin.user.id }, data: { email: 'admin@pk.vn' } });
    const res = await api(app)
      .post('/api/staff/receptionists')
      .set(admin.auth)
      .send({ fullName: 'Lễ Tân Mới', phone: '0987000444', email: 'admin@pk.vn', password: 'letan2026' })
      .expect(409);
    expect(res.body.message).toBe('Email đã được dùng cho tài khoản khác');

    const specialty = await prisma.specialty.create({ data: { name: 'Nội tổng quát' } });
    await api(app)
      .post('/api/doctors')
      .set(admin.auth)
      .send({ fullName: 'Bác Sĩ Mới', phone: '0987000555', email: 'admin@pk.vn', password: 'bacsi2026', specialtyId: specialty.id })
      .expect(409);
  });

  it('câu báo theo cột bị trùng', () => {
    expect(uniqueMessage(['phone'])).toBe('Số điện thoại đã được dùng');
    expect(uniqueMessage(['doctorId', 'startTime'])).toBe('Dữ liệu bị trùng với bản ghi đã có');
  });
});
