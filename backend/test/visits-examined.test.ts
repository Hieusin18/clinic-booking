import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, nextPhone } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

describe('Bác sĩ tra cứu bệnh án đã khám (GET /visits/examined)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let other: Awaited<ReturnType<typeof createDoctor>>;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    doctor = await createDoctor(app, prisma);
    other = await createDoctor(app, prisma);
  });
  afterAll(async () => app.close());

  /** Một lượt khám (mặc định đã xong) kèm bệnh án, ngày khám `date` (YYYY-MM-DD). */
  async function visit(o: { doctorId: string; name: string; date: string; diagnosis: string; icd?: string; status?: 'DONE' | 'LEFT' | 'WAITING'; n?: number }) {
    const p = await prisma.patient.create({ data: { fullName: o.name, phone: nextPhone(), dateOfBirth: new Date('1980-05-05'), gender: 'MALE' } });
    const v = await prisma.visit.create({
      data: { patientId: p.id, doctorId: o.doctorId, date: new Date(`${o.date}T00:00:00Z`), queueNumber: o.n ?? 1, source: 'WALK_IN', checkinMethod: 'RECEPTION', status: o.status ?? 'DONE' },
    });
    await prisma.medicalRecord.create({ data: { visitId: v.id, symptoms: 'Ho', diagnosis: o.diagnosis, icdCode: o.icd ?? null } });
    return { visit: v, patient: p };
  }

  it('chỉ lượt đã khám xong của chính bác sĩ, mới nhất trước, có chẩn đoán', async () => {
    await visit({ doctorId: doctor.doctor.id, name: 'Lê Văn Cũ', date: '2026-10-01', diagnosis: 'Viêm họng cấp', icd: 'J02.9' });
    const mai = await visit({ doctorId: doctor.doctor.id, name: 'Phạm Thị Mai', date: '2026-11-05', diagnosis: 'Tăng huyết áp', icd: 'I10' });
    await visit({ doctorId: doctor.doctor.id, name: 'Bỏ Về', date: '2026-11-06', diagnosis: 'x', status: 'LEFT', n: 2 });
    await visit({ doctorId: other.doctor.id, name: 'Bác Sĩ Khác', date: '2026-11-06', diagnosis: 'y' });

    const res = await api(app).get('/api/visits/examined').set(doctor.auth).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((v: { patient: { fullName: string } }) => v.patient.fullName)).toEqual(['Phạm Thị Mai', 'Lê Văn Cũ']);
    expect(res.body.items[0]).toMatchObject({ id: mai.visit.id, status: 'DONE', medicalRecord: { diagnosis: 'Tăng huyết áp', icdCode: 'I10' }, prescription: null });
  });

  it('tìm theo tên (không phân biệt hoa thường), SĐT, chẩn đoán, mã ICD; lọc theo ngày; phân trang', async () => {
    const a = await visit({ doctorId: doctor.doctor.id, name: 'Phạm Thị Mai', date: '2026-11-05', diagnosis: 'Tăng huyết áp', icd: 'I10' });
    await visit({ doctorId: doctor.doctor.id, name: 'Lê Văn Cũ', date: '2026-10-01', diagnosis: 'Viêm họng cấp', icd: 'J02.9' });
    await visit({ doctorId: doctor.doctor.id, name: 'Trần Văn Ba', date: '2026-11-02', diagnosis: 'Viêm phế quản cấp', icd: 'J20.9' });
    const find = async (query: Record<string, string | number>) =>
      (await api(app).get('/api/visits/examined').query(query).set(doctor.auth).expect(200)).body as { items: { patient: { fullName: string } }[]; total: number };
    const names = (r: Awaited<ReturnType<typeof find>>) => r.items.map((v) => v.patient.fullName);

    expect(names(await find({ q: 'phạm thị' }))).toEqual(['Phạm Thị Mai']);
    expect(names(await find({ q: a.patient.phone.slice(0, 6) }))).toContain('Phạm Thị Mai');
    expect(names(await find({ q: 'viêm' }))).toEqual(['Trần Văn Ba', 'Lê Văn Cũ']);
    expect(names(await find({ q: 'j0' }))).toEqual(['Lê Văn Cũ']);
    expect(names(await find({ from: '2026-11-01', to: '2026-11-04' }))).toEqual(['Trần Văn Ba']);
    const p2 = await find({ page: 2, pageSize: 2 });
    expect([p2.total, names(p2)]).toEqual([3, ['Lê Văn Cũ']]);
  });

  it('chỉ bác sĩ được tra cứu; tham số sai bị từ chối', async () => {
    const patient = await createPatient(app, prisma);
    await api(app).get('/api/visits/examined').set(patient.auth).expect(403);
    await api(app).get('/api/visits/examined').query({ from: 'hôm qua' }).set(doctor.auth).expect(400);
    await api(app).get('/api/visits/examined').query({ pageSize: 500 }).set(doctor.auth).expect(400);
  });
});
