import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { todayVN } from '../src/common/time.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

describe('Khám bệnh, bệnh án và đơn thuốc', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let patient: Awaited<ReturnType<typeof createPatient>>;
  let reception: { Authorization: string };
  let meds: { id: string }[];

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    doctor = await createDoctor(app, prisma);
    patient = await createPatient(app, prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
    meds = await Promise.all(
      ['Paracetamol', 'Amoxicillin'].map((name) => prisma.medicine.create({ data: { name, strength: '500mg', unit: 'viên' } })),
    );
  });
  afterAll(async () => app.close());

  /** Bệnh nhân vào hàng đợi rồi bác sĩ gọi số → phiếu khám đang khám. */
  async function startVisit() {
    const ticket = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: patient.patient.id, doctorId: doctor.doctor.id }).expect(201);
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    return ticket.body.id as string;
  }

  const record = { symptoms: 'Sốt 38,5 độ, đau họng 2 ngày', diagnosis: 'Viêm họng cấp', orders: 'Tái khám sau 5 ngày' };
  const items = () => [
    { medicineId: meds[0].id, quantity: 10, dosePerTime: '1 viên', timesPerDay: 2, days: 5, note: 'Uống khi sốt trên 38,5 độ' },
    { medicineId: meds[1].id, quantity: 15, dosePerTime: '1 viên', timesPerDay: 3, days: 5, note: 'Uống sau ăn' },
  ];

  describe('Bệnh án', () => {
    it('bác sĩ ghi và sửa bệnh án cho bệnh nhân đang khám', async () => {
      const visitId = await startVisit();
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(record).expect(200);
      const updated = await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send({ ...record, diagnosis: 'Viêm amidan cấp' }).expect(200);
      expect(updated.body.diagnosis).toBe('Viêm amidan cấp');
      expect(await prisma.medicalRecord.count()).toBe(1);
    });

    it('chưa gọi số thì chưa ghi được bệnh án', async () => {
      const ticket = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: patient.patient.id, doctorId: doctor.doctor.id }).expect(201);
      const res = await api(app).put(`/api/visits/${ticket.body.id}/record`).set(doctor.auth).send(record).expect(409);
      expect(res.body.message).toBe('Chỉ ghi được cho bệnh nhân đang khám, hãy gọi số trước');
    });

    it('bác sĩ khác, lễ tân và admin đều không ghi hay đọc được bệnh án', async () => {
      const visitId = await startVisit();
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(record).expect(200);
      const other = await createDoctor(app, prisma);
      const admin = await createUser(app, prisma, 'ADMIN');
      await api(app).put(`/api/visits/${visitId}/record`).set(other.auth).send(record).expect(404);
      await api(app).put(`/api/visits/${visitId}/record`).set(reception).send(record).expect(403);
      await api(app).get(`/api/visits/${visitId}`).set(reception).expect(403);
      await api(app).get(`/api/visits/${visitId}`).set(admin.auth).expect(403);
      await api(app).get(`/api/visits/${visitId}`).set(other.auth).expect(404);
    });

    it('hoàn tất lượt khám cần có bệnh án; lịch hẹn chuyển sang đã khám', async () => {
      const start = new Date(Date.now() + 3_600_000);
      const slot = await prisma.schedule.create({ data: { doctorId: doctor.doctor.id, date: todayVN(), startTime: start, endTime: new Date(start.getTime() + 900_000), isBooked: true } });
      const appt = await prisma.appointment.create({ data: { patientId: patient.patient.id, scheduleId: slot.id, status: 'CONFIRMED' } });
      const v = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id }).expect(201);
      await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);

      const early = await api(app).post(`/api/visits/${v.body.id}/complete`).set(doctor.auth).expect(409);
      expect(early.body.message).toBe('Cần ghi bệnh án trước khi hoàn tất lượt khám');
      await api(app).put(`/api/visits/${v.body.id}/record`).set(doctor.auth).send(record).expect(200);
      const done = await api(app).post(`/api/visits/${v.body.id}/complete`).set(doctor.auth).expect(200);
      expect(done.body.status).toBe('DONE');
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('COMPLETED');
      // xong lượt này thì gọi được số tiếp theo (không bị chặn bởi lượt đang khám)
      await api(app).post('/api/queue/call-next').set(doctor.auth).expect(404);
    });
  });

  describe('Đơn thuốc', () => {
    it('kê đơn nháp, sửa, hoàn tất; đơn hoàn tất không sửa được', async () => {
      const visitId = await startVisit();
      const draft = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ advice: 'Uống nhiều nước', items: items() }).expect(201);
      expect(draft.body).toMatchObject({ status: 'DRAFT', advice: 'Uống nhiều nước' });
      expect(draft.body.items).toHaveLength(2);

      const edited = await api(app).patch(`/api/prescriptions/${draft.body.id}`).set(doctor.auth).send({ items: items().slice(0, 1) }).expect(200);
      expect(edited.body.items).toHaveLength(1);

      const fin = await api(app).post(`/api/prescriptions/${draft.body.id}/finalize`).set(doctor.auth).expect(200);
      expect(fin.body.status).toBe('FINALIZED');
      expect(fin.body.finalizedAt).toBeTruthy();

      const locked = await api(app).patch(`/api/prescriptions/${draft.body.id}`).set(doctor.auth).send({ items: items() }).expect(409);
      expect(locked.body.message).toBe('Đơn đã hoàn tất, không sửa được. Hãy tạo đơn mới để thay thế');
      await api(app).delete(`/api/prescriptions/${draft.body.id}`).set(doctor.auth).expect(409);
    });

    it('sửa đơn đã khóa bằng cách tạo đơn thay thế; bệnh nhân chỉ thấy đơn mới nhất đã hoàn tất', async () => {
      const visitId = await startVisit();
      const first = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items().slice(0, 1) }).expect(201);
      await api(app).post(`/api/prescriptions/${first.body.id}/finalize`).set(doctor.auth).expect(200);

      const second = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items() }).expect(201);
      expect(second.body.replacesId).toBe(first.body.id);

      // Đơn thay thế còn nháp: bệnh nhân vẫn thấy đơn cũ
      let seen = await api(app).get(`/api/visits/${visitId}`).set(patient.auth).expect(200);
      expect(seen.body.prescription.id).toBe(first.body.id);
      expect(seen.body.prescriptions).toBeUndefined();

      await api(app).post(`/api/prescriptions/${second.body.id}/finalize`).set(doctor.auth).expect(200);
      seen = await api(app).get(`/api/visits/${visitId}`).set(patient.auth).expect(200);
      expect(seen.body.prescription.id).toBe(second.body.id);
      expect(seen.body.prescription.items).toHaveLength(2);
    });

    it('không có hai đơn nháp cùng lúc; xóa được đơn nháp', async () => {
      const visitId = await startVisit();
      const d = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items() }).expect(201);
      await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items() }).expect(409);
      await api(app).delete(`/api/prescriptions/${d.body.id}`).set(doctor.auth).expect(204);
      await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items() }).expect(201);
    });

    it('từ chối đơn rỗng, thuốc ngừng dùng và thuốc ghi trùng dòng', async () => {
      const visitId = await startVisit();
      const empty = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: [] }).expect(400);
      expect(empty.body.message).toContain('Đơn thuốc cần ít nhất một loại thuốc');

      await prisma.medicine.update({ where: { id: meds[1].id }, data: { isActive: false } });
      const inactive = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items() }).expect(400);
      expect(inactive.body.message).toBe('Có thuốc không tồn tại hoặc đã ngừng dùng');

      const dup = [items()[0], items()[0]];
      await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: dup }).expect(400);
    });

    it('không hoàn tất lượt khám khi đơn còn nháp', async () => {
      const visitId = await startVisit();
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(record).expect(200);
      await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ items: items() }).expect(201);
      const res = await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(409);
      expect(res.body.message).toBe('Đơn thuốc còn ở dạng nháp, hãy hoàn tất hoặc xóa đơn');
    });
  });

  describe('Bệnh nhân xem lại trên app', () => {
    it('lịch sử khám có bệnh án và đơn thuốc đủ thông tin để mua thuốc', async () => {
      const visitId = await startVisit();
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(record).expect(200);
      const p = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth).send({ advice: 'Kiêng đồ lạnh', items: items() }).expect(201);
      await api(app).post(`/api/prescriptions/${p.body.id}/finalize`).set(doctor.auth).expect(200);
      await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(200);

      const history = await api(app).get('/api/visits/mine').set(patient.auth).expect(200);
      expect(history.body).toHaveLength(1);
      const [v] = history.body;
      expect(v.medicalRecord.diagnosis).toBe('Viêm họng cấp');
      expect(v.prescription.advice).toBe('Kiêng đồ lạnh');
      expect(v.prescription.items[0]).toMatchObject({
        quantity: 10,
        dosePerTime: '1 viên',
        timesPerDay: 2,
        days: 5,
        medicine: { name: 'Paracetamol', strength: '500mg', unit: 'viên' },
      });
    });

    it('bệnh nhân không xem được lượt khám của người khác', async () => {
      const visitId = await startVisit();
      const stranger = await createPatient(app, prisma);
      await api(app).get(`/api/visits/${visitId}`).set(stranger.auth).expect(404);
      expect((await api(app).get('/api/visits/mine').set(stranger.auth).expect(200)).body).toHaveLength(0);
    });

    it('bác sĩ xem được các lần khám trước của bệnh nhân', async () => {
      const visitId = await startVisit();
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(record).expect(200);
      await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(200);
      const other = await createDoctor(app, prisma);
      const res = await api(app).get(`/api/visits/history?patientId=${patient.patient.id}`).set(other.auth).expect(200);
      expect(res.body[0].medicalRecord.diagnosis).toBe('Viêm họng cấp');
    });
  });
});
