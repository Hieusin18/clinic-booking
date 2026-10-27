import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { todayVN } from '../src/common/time.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createQrToken } from '../src/qr/qr-token.js';
import { createDoctor, createPatient, createSpecialty, createUser, nextPhone } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

describe('Tiếp đón, hàng đợi và QR', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reception: { Authorization: string };
  let doctor: Awaited<ReturnType<typeof createDoctor>>;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
    doctor = await createDoctor(app, prisma);
  });
  afterAll(async () => app.close());

  const qr = (ageMs = 0) => createQrToken(process.env.CLINIC_ID!, process.env.QR_SECRET!, Date.now() - ageMs);

  /** Lịch hẹn của bệnh nhân với bác sĩ, khung giờ sau hiện tại 2 tiếng; date mặc định hôm nay. */
  async function bookToday(patientId: string, date = todayVN()) {
    const start = new Date(Date.now() + 2 * 3_600_000);
    const slot = await prisma.schedule.create({
      data: { doctorId: doctor.doctor.id, date, startTime: start, endTime: new Date(start.getTime() + 900_000), isBooked: true },
    });
    return prisma.appointment.create({ data: { patientId, scheduleId: slot.id, status: 'CONFIRMED', reason: 'Ho kéo dài' } });
  }

  async function walkInPatient() {
    return prisma.patient.create({
      data: { fullName: 'Bà Tư', phone: nextPhone(), dateOfBirth: new Date('1950-05-05'), gender: 'FEMALE' },
    });
  }

  describe('Hồ sơ bệnh nhân (lễ tân)', () => {
    it('tìm theo SĐT, tạo mới khi chưa có, không cho trùng SĐT hoặc CCCD', async () => {
      const phone = nextPhone();
      expect((await api(app).get(`/api/patients?q=${phone}`).set(reception).expect(200)).body.total).toBe(0);
      const body = { fullName: 'Trần Văn Tám', phone, dateOfBirth: '1960-01-01', gender: 'MALE', nationalId: '001060000001', allergies: 'Aspirin' };
      await api(app).post('/api/patients').set(reception).send(body).expect(201);
      expect((await api(app).get(`/api/patients?q=${phone}`).set(reception).expect(200)).body.items[0].allergies).toBe('Aspirin');
      expect((await api(app).get('/api/patients?q=001060000001').set(reception).expect(200)).body.total).toBe(1);
      await api(app).post('/api/patients').set(reception).send(body).expect(409);
      await api(app).post('/api/patients').set(reception).send({ ...body, phone: nextPhone() }).expect(409);
    });

    it('CCCD sai định dạng trả 400', async () => {
      const res = await api(app)
        .post('/api/patients')
        .set(reception)
        .send({ fullName: 'A B', phone: nextPhone(), dateOfBirth: '1990-01-01', gender: 'MALE', nationalId: '123' })
        .expect(400);
      expect(res.body.message).toContain('Số CCCD phải gồm 12 chữ số');
    });

    it('bệnh nhân xem và sửa hồ sơ của mình nhưng không gọi được API tìm kiếm', async () => {
      const p = await createPatient(app, prisma);
      const updated = await api(app).patch('/api/patients/me').set(p.auth).send({ allergies: 'Hải sản', address: 'Hà Đông' }).expect(200);
      expect(updated.body).toMatchObject({ allergies: 'Hải sản', address: 'Hà Đông', phone: p.patient.phone });
      await api(app).get('/api/patients').set(p.auth).expect(403);
    });
  });

  describe('Cấp số và check-in tại quầy', () => {
    it('lễ tân cấp số cho bệnh nhân đến trực tiếp, số tăng dần', async () => {
      const a = await walkInPatient();
      const b = await walkInPatient();
      const t1 = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: a.id, doctorId: doctor.doctor.id }).expect(201);
      const t2 = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: b.id, doctorId: doctor.doctor.id }).expect(201);
      expect([t1.body.queueNumber, t2.body.queueNumber]).toEqual([1, 2]);
      expect(t1.body).toMatchObject({ source: 'WALK_IN', checkinMethod: 'RECEPTION', status: 'WAITING' });
    });

    it('20 yêu cầu lấy số đồng thời cho cùng bác sĩ: số không trùng, liền mạch 1–20', async () => {
      const patients = await Promise.all(Array.from({ length: 20 }, () => walkInPatient()));
      const results = await Promise.all(
        patients.map((p) => api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id })),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const numbers = results.map((r) => r.body.queueNumber).sort((x, y) => x - y);
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it('một bệnh nhân chỉ giữ một số đang chờ cho mỗi chuyên khoa', async () => {
      const p = await walkInPatient();
      const sameSpecialty = await createDoctor(app, prisma, doctor.doctor.specialtyId);
      const otherSpecialty = await createDoctor(app, prisma, (await createSpecialty(prisma)).id);
      await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id }).expect(201);
      const res = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: sameSpecialty.doctor.id }).expect(409);
      expect(res.body.message).toBe('Bệnh nhân đang giữ số 1 cho chuyên khoa này');
      await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: otherSpecialty.doctor.id }).expect(201);
    });

    it('check-in lịch hẹn hôm nay; không check-in hai lần; không check-in lịch ngày khác', async () => {
      const p = await createPatient(app, prisma);
      const appt = await bookToday(p.patient.id);
      const res = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id }).expect(201);
      expect(res.body).toMatchObject({ source: 'ONLINE', checkinMethod: 'RECEPTION', reason: 'Ho kéo dài', appointmentId: appt.id });
      await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id }).expect(409);

      const p2 = await createPatient(app, prisma);
      const tomorrow = new Date(todayVN().getTime() + 86_400_000);
      const later = await bookToday(p2.patient.id, tomorrow);
      const wrongDay = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: later.id }).expect(409);
      expect(wrongDay.body.message).toBe('Lịch hẹn không phải hôm nay');
    });

    it('không cấp số cho bác sĩ đã bị khóa', async () => {
      const p = await walkInPatient();
      await prisma.user.update({ where: { id: doctor.user.id }, data: { isActive: false } });
      await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id }).expect(404);
    });
  });

  describe('Quét QR tại quầy', () => {
    it('bệnh nhân đã đặt lịch hôm nay: quét là tự check-in', async () => {
      const p = await createPatient(app, prisma);
      const appt = await bookToday(p.patient.id);
      const res = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr() }).expect(201);
      expect(res.body).toMatchObject({ appointmentId: appt.id, source: 'ONLINE', checkinMethod: 'QR', queueNumber: 1 });
    });

    it('chưa đặt lịch: phải chọn bác sĩ, rồi được cấp số mới', async () => {
      const p = await createPatient(app, prisma);
      const missing = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr() }).expect(400);
      expect(missing.body.message).toBe('Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ');
      const res = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr(), doctorId: doctor.doctor.id, reason: 'Sốt' }).expect(201);
      expect(res.body).toMatchObject({ source: 'WALK_IN', checkinMethod: 'QR', reason: 'Sốt', patient: { id: p.patient.id } });
    });

    it('mã QR quá 60 giây hoặc bị sửa thì từ chối', async () => {
      const p = await createPatient(app, prisma);
      const expired = await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr(61_000), doctorId: doctor.doctor.id }).expect(400);
      expect(expired.body.message).toBe('Mã QR đã hết hạn, vui lòng quét lại mã trên màn hình');
      await api(app).post('/api/queue/scan').set(p.auth).send({ token: qr() + 'x', doctorId: doctor.doctor.id }).expect(400);
    });

    it('bệnh nhân lấy từ JWT: không lấy số hộ người khác được', async () => {
      const p = await createPatient(app, prisma);
      const other = await createPatient(app, prisma);
      const res = await api(app)
        .post('/api/queue/scan')
        .set(p.auth)
        .send({ token: qr(), doctorId: doctor.doctor.id, patientId: other.patient.id })
        .expect(201);
      expect(res.body.patient.id).toBe(p.patient.id);
    });
  });

  describe('Gọi số và theo dõi số thứ tự', () => {
    it('gọi số theo thứ tự; phải xong lượt đang khám mới gọi tiếp; hết người thì 404', async () => {
      const [a, b] = [await walkInPatient(), await walkInPatient()];
      await api(app).post('/api/queue/tickets').set(reception).send({ patientId: a.id, doctorId: doctor.doctor.id }).expect(201);
      const t2 = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: b.id, doctorId: doctor.doctor.id }).expect(201);

      const first = await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
      expect(first.body).toMatchObject({ queueNumber: 1, status: 'IN_PROGRESS' });
      const blocked = await api(app).post('/api/queue/call-next').set(doctor.auth).expect(409);
      expect(blocked.body.message).toBe('Bạn đang khám số 1, hãy hoàn tất trước khi gọi tiếp');

      await api(app).patch(`/api/queue/${first.body.id}/left`).set(doctor.auth).expect(200);
      const second = await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
      expect(second.body.id).toBe(t2.body.id);
      await api(app).patch(`/api/queue/${second.body.id}/left`).set(doctor.auth).expect(200);
      await api(app).post('/api/queue/call-next').set(doctor.auth).expect(404);
    });

    it('bác sĩ chỉ thấy hàng đợi của mình và không đánh dấu được bệnh nhân của bác sĩ khác', async () => {
      const other = await createDoctor(app, prisma);
      const p = await walkInPatient();
      const t = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id }).expect(201);
      expect((await api(app).get('/api/queue/doctor').set(other.auth).expect(200)).body).toHaveLength(0);
      expect((await api(app).get('/api/queue/doctor').set(doctor.auth).expect(200)).body).toHaveLength(1);
      await api(app).patch(`/api/queue/${t.body.id}/left`).set(other.auth).expect(404);
    });

    it('bỏ về thì lịch hẹn chuyển sang vắng mặt', async () => {
      const p = await createPatient(app, prisma);
      const appt = await bookToday(p.patient.id);
      const v = await api(app).post('/api/queue/checkin').set(reception).send({ appointmentId: appt.id }).expect(201);
      await api(app).patch(`/api/queue/${v.body.id}/left`).set(reception).expect(200);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('NO_SHOW');
    });

    it('màn hình số thứ tự: số người phía trước và số đang khám; chỉ chủ phiếu xem được', async () => {
      const patients = [await walkInPatient(), await walkInPatient()];
      for (const x of patients) await api(app).post('/api/queue/tickets').set(reception).send({ patientId: x.id, doctorId: doctor.doctor.id }).expect(201);
      const me = await createPatient(app, prisma);
      const mine = await api(app).post('/api/queue/scan').set(me.auth).send({ token: qr(), doctorId: doctor.doctor.id }).expect(201);

      let pos = await api(app).get(`/api/queue/${mine.body.id}/position`).set(me.auth).expect(200);
      expect(pos.body).toMatchObject({ peopleAhead: 2, currentNumber: null, visit: { queueNumber: 3 } });

      await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
      pos = await api(app).get(`/api/queue/${mine.body.id}/position`).set(me.auth).expect(200);
      expect(pos.body).toMatchObject({ peopleAhead: 1, currentNumber: 1 });

      expect((await api(app).get('/api/queue/mine').set(me.auth).expect(200)).body[0].id).toBe(mine.body.id);
      const stranger = await createPatient(app, prisma);
      await api(app).get(`/api/queue/${mine.body.id}/position`).set(stranger.auth).expect(404);
    });

    it('lễ tân xem hàng đợi hôm nay lọc theo bác sĩ', async () => {
      const p = await walkInPatient();
      await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id }).expect(201);
      const res = await api(app).get(`/api/queue/today?doctorId=${doctor.doctor.id}`).set(reception).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].patient.fullName).toBe('Bà Tư');
    });
  });
});
