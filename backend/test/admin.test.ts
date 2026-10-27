import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createSpecialty, createUser, nextPhone } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

describe('Quản trị: chuyên khoa, bác sĩ, lễ tân, thuốc', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: { Authorization: string };

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    admin = (await createUser(app, prisma, 'ADMIN')).auth;
  });
  afterAll(async () => app.close());

  describe('Chuyên khoa', () => {
    it('admin thêm, sửa; ai cũng xem được danh sách có phân trang', async () => {
      const created = await api(app).post('/api/specialties').set(admin).send({ name: 'Nhi khoa' }).expect(201);
      await api(app).patch(`/api/specialties/${created.body.id}`).set(admin).send({ description: 'Trẻ em' }).expect(200);
      await api(app).post('/api/specialties').set(admin).send({ name: 'Da liễu' }).expect(201);

      const page = await api(app).get('/api/specialties?pageSize=1').expect(200);
      expect(page.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(page.body.items).toHaveLength(1);
      expect(page.body.items[0].name).toBe('Da liễu');
    });

    it('không cho trùng tên (không phân biệt hoa thường)', async () => {
      await api(app).post('/api/specialties').set(admin).send({ name: 'Nhi khoa' }).expect(201);
      await api(app).post('/api/specialties').set(admin).send({ name: 'NHI KHOA' }).expect(409);
    });

    it('không xóa được chuyên khoa còn bác sĩ, xóa được khi trống', async () => {
      const busy = await createSpecialty(prisma);
      await createDoctor(app, prisma, busy.id);
      const res = await api(app).delete(`/api/specialties/${busy.id}`).set(admin).expect(409);
      expect(res.body.message).toBe('Không xóa được chuyên khoa còn bác sĩ');

      const empty = await createSpecialty(prisma);
      await api(app).delete(`/api/specialties/${empty.id}`).set(admin).expect(204);
    });

    it('lễ tân không thêm được chuyên khoa', async () => {
      const receptionist = await createUser(app, prisma, 'RECEPTIONIST');
      await api(app).post('/api/specialties').set(receptionist.auth).send({ name: 'Nội' }).expect(403);
    });
  });

  describe('Bác sĩ', () => {
    it('admin tạo bác sĩ kèm tài khoản; bác sĩ đăng nhập được', async () => {
      const s = await createSpecialty(prisma);
      const phone = nextPhone();
      const res = await api(app)
        .post('/api/doctors')
        .set(admin)
        .send({ fullName: 'Lê Văn Bác', phone, password: '123456', specialtyId: s.id, title: 'ThS.BS' })
        .expect(201);
      expect(res.body).toMatchObject({ title: 'ThS.BS', specialty: { id: s.id }, user: { fullName: 'Lê Văn Bác', phone } });

      const login = await api(app).post('/api/auth/login').send({ phone, password: '123456' }).expect(200);
      expect(login.body.user.role).toBe('DOCTOR');
    });

    it('lọc theo chuyên khoa; bác sĩ bị khóa bị ẩn với bệnh nhân nhưng admin vẫn thấy', async () => {
      const s1 = await createSpecialty(prisma);
      const s2 = await createSpecialty(prisma);
      const d1 = await createDoctor(app, prisma, s1.id);
      await createDoctor(app, prisma, s2.id);

      const filtered = await api(app).get(`/api/doctors?specialtyId=${s1.id}`).expect(200);
      expect(filtered.body.items.map((d: { id: string }) => d.id)).toEqual([d1.doctor.id]);

      await api(app).patch(`/api/doctors/${d1.doctor.id}`).set(admin).send({ isActive: false }).expect(200);
      expect((await api(app).get('/api/doctors').expect(200)).body.total).toBe(1);
      expect((await api(app).get('/api/doctors/all').set(admin).expect(200)).body.total).toBe(2);
      await api(app).post('/api/auth/login').send({ phone: d1.user.phone, password: '123456' }).expect(401);
    });

    it('trùng SĐT với tài khoản khác trả 409', async () => {
      const s = await createSpecialty(prisma);
      const existing = await createUser(app, prisma, 'PATIENT');
      await api(app)
        .post('/api/doctors')
        .set(admin)
        .send({ fullName: 'Ai đó', phone: existing.user.phone, password: '123456', specialtyId: s.id })
        .expect(409);
    });
  });

  describe('Tài khoản lễ tân', () => {
    it('admin tạo, khóa và đặt lại mật khẩu', async () => {
      const phone = nextPhone();
      const created = await api(app)
        .post('/api/staff/receptionists')
        .set(admin)
        .send({ fullName: 'Lễ tân Lan', phone, password: '123456' })
        .expect(201);
      expect(created.body).toMatchObject({ role: 'RECEPTIONIST', isActive: true });

      await api(app).patch(`/api/staff/receptionists/${created.body.id}`).set(admin).send({ password: 'moi-123' }).expect(200);
      await api(app).post('/api/auth/login').send({ phone, password: 'moi-123' }).expect(200);

      await api(app).patch(`/api/staff/receptionists/${created.body.id}`).set(admin).send({ isActive: false }).expect(200);
      await api(app).post('/api/auth/login').send({ phone, password: 'moi-123' }).expect(401);

      const list = await api(app).get('/api/staff/receptionists').set(admin).expect(200);
      expect(list.body.total).toBe(1);
    });

    it('không sửa được tài khoản không phải lễ tân qua API này', async () => {
      const doctor = await createUser(app, prisma, 'DOCTOR');
      await api(app).patch(`/api/staff/receptionists/${doctor.user.id}`).set(admin).send({ isActive: false }).expect(404);
    });
  });

  describe('Danh mục thuốc', () => {
    it('admin thêm thuốc; bác sĩ tìm theo tên hoặc hoạt chất', async () => {
      await api(app).post('/api/medicines').set(admin).send({ name: 'Panadol', activeIngredient: 'Paracetamol', strength: '500mg', unit: 'viên' }).expect(201);
      await api(app).post('/api/medicines').set(admin).send({ name: 'Augmentin', activeIngredient: 'Amoxicillin', unit: 'viên' }).expect(201);
      const doctor = await createUser(app, prisma, 'DOCTOR');

      const byIngredient = await api(app).get('/api/medicines?q=paracetamol').set(doctor.auth).expect(200);
      expect(byIngredient.body.items.map((m: { name: string }) => m.name)).toEqual(['Panadol']);
    });

    it('thuốc ngừng dùng không hiện khi kê đơn, admin vẫn xem được', async () => {
      const m = await api(app).post('/api/medicines').set(admin).send({ name: 'Thuốc cũ', unit: 'viên' }).expect(201);
      await api(app).patch(`/api/medicines/${m.body.id}`).set(admin).send({ isActive: false }).expect(200);
      const doctor = await createUser(app, prisma, 'DOCTOR');
      expect((await api(app).get('/api/medicines').set(doctor.auth).expect(200)).body.total).toBe(0);
      expect((await api(app).get('/api/medicines?includeInactive=true').set(admin).expect(200)).body.total).toBe(1);
    });

    it('bệnh nhân không xem được danh mục thuốc', async () => {
      const patient = await createUser(app, prisma, 'PATIENT');
      await api(app).get('/api/medicines').set(patient.auth).expect(403);
    });
  });
});
