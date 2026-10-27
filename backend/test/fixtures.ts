import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '../src/auth/password.js';
import type { Role } from '../src/generated/prisma/enums.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { api } from './helpers.js';

export const PASSWORD = '123456';
let counter = 0;

/** SĐT không trùng giữa các lần gọi trong cùng một file test. */
export const nextPhone = () => `09${String(++counter).padStart(8, '0')}`;

/** Tạo tài khoản trực tiếp trong CSDL (không qua API) rồi đăng nhập lấy token. */
export async function createUser(app: INestApplication, prisma: PrismaService, role: Role, fullName = `Người dùng ${role}`) {
  const phone = nextPhone();
  const user = await prisma.user.create({
    data: { fullName, phone, role, passwordHash: await hashPassword(PASSWORD) },
  });
  const res = await api(app).post('/api/auth/login').send({ phone, password: PASSWORD }).expect(200);
  return { user, token: res.body.accessToken as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export async function createSpecialty(prisma: PrismaService, name = `Chuyên khoa ${++counter}`) {
  return prisma.specialty.create({ data: { name } });
}

/** Tạo bác sĩ (kèm tài khoản) và trả về token đăng nhập của bác sĩ đó. */
export async function createDoctor(app: INestApplication, prisma: PrismaService, specialtyId?: string) {
  const sid = specialtyId ?? (await createSpecialty(prisma)).id;
  const login = await createUser(app, prisma, 'DOCTOR', `Bác sĩ ${counter}`);
  const doctor = await prisma.doctor.create({ data: { userId: login.user.id, specialtyId: sid } });
  return { ...login, doctor };
}

/** Bệnh nhân có tài khoản app + hồ sơ. */
export async function createPatient(app: INestApplication, prisma: PrismaService) {
  const login = await createUser(app, prisma, 'PATIENT', `Bệnh nhân ${counter}`);
  const patient = await prisma.patient.create({
    data: {
      userId: login.user.id,
      fullName: login.user.fullName,
      phone: login.user.phone,
      dateOfBirth: new Date('1990-01-01'),
      gender: 'FEMALE',
    },
  });
  return { ...login, patient };
}
