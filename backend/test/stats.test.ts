import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { daysBetween, median, percent, StatsService } from '../src/stats/stats.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const MIN = 60_000;
/** Giờ Việt Nam → Date */
const vn = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+07:00`);

describe('Thống kê cho admin', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  it('hàm phụ: trung vị, phần trăm, danh sách ngày', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBeNull();
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('chỉ admin xem được; kiểm tra khoảng ngày', async () => {
    const admin = await createUser(app, prisma, 'ADMIN');
    const doctor = await createDoctor(app, prisma);
    await api(app).get('/api/stats/overview?from=2026-11-01&to=2026-11-07').set(doctor.auth).expect(403);
    await api(app).get('/api/stats/overview?from=2026-11-01').set(admin.auth).expect(400);
    await api(app).get('/api/stats/overview?from=2026-11-07&to=2026-11-01').set(admin.auth).expect(400);
    await api(app).get('/api/stats/overview?from=2025-01-01&to=2026-11-01').set(admin.auth).expect(400);
    const empty = (await api(app).get('/api/stats/overview?from=2026-11-01&to=2026-11-07').set(admin.auth).expect(200)).body;
    expect(empty.kpis).toMatchObject({ visits: 0, completed: 0, waitMedian: null, onlineShare: null, noShowRate: null });
    expect(empty.daily).toHaveLength(7);
    expect(empty.previousRange).toEqual({ from: '2026-10-25', to: '2026-10-31' });
  });

  it('tính đúng số lượt, thời gian chờ, thời gian khám, chẩn đoán, thuốc, lịch hẹn và so với kỳ trước', async () => {
    const d1 = await createDoctor(app, prisma);
    const d2 = await createDoctor(app, prisma);
    const p1 = await createPatient(app, prisma);
    const p2 = await createPatient(app, prisma);
    const med = await prisma.medicine.create({ data: { name: 'Paracetamol', unit: 'viên' } });
    let q = 0;
    const visit = async (o: {
      doctorId: string;
      patientId: string;
      day: string;
      source: 'ONLINE' | 'WALK_IN';
      checkin: string;
      called?: string;
      done?: string;
      appointmentAt?: string;
      icd?: string;
      dx?: string;
      lab?: { sent: string; ready: string };
      status?: 'DONE' | 'LEFT';
    }) => {
      const v = await prisma.visit.create({
        data: {
          doctorId: o.doctorId,
          patientId: o.patientId,
          date: new Date(o.day),
          queueNumber: ++q,
          source: o.source,
          checkinMethod: 'RECEPTION',
          status: o.status ?? 'DONE',
          createdAt: vn(o.day, o.checkin),
          calledAt: o.called ? vn(o.day, o.called) : null,
          completedAt: o.done ? vn(o.day, o.done) : null,
          appointmentAt: o.appointmentAt ? vn(o.day, o.appointmentAt) : null,
          resultMode: o.lab ? 'RETURN' : null,
          sentForTestsAt: o.lab ? vn(o.day, o.lab.sent) : null,
          resultsReadyAt: o.lab ? vn(o.day, o.lab.ready) : null,
          ...(o.dx ? { medicalRecord: { create: { symptoms: 's', diagnosis: o.dx, icdCode: o.icd } } } : {}),
        },
      });
      return v;
    };

    // Kỳ trước (25–31/10): một lượt vãng lai của p1 → p1 không phải bệnh nhân mới trong kỳ này
    await visit({
      doctorId: d1.doctor.id,
      patientId: p1.patient.id,
      day: '2026-10-28',
      source: 'WALK_IN',
      checkin: '08:00',
      called: '08:40',
      done: '08:50',
      dx: 'Viêm họng cấp',
      icd: 'J02.9',
    });

    // Kỳ này (01–07/11)
    // Vãng lai: chờ 20 và 30 phút; khám 10 và 6 phút
    const a = await visit({
      doctorId: d1.doctor.id,
      patientId: p1.patient.id,
      day: '2026-11-02',
      source: 'WALK_IN',
      checkin: '07:40',
      called: '08:00',
      done: '08:10',
      dx: 'Viêm họng cấp',
      icd: 'j02.9',
    });
    await visit({
      doctorId: d1.doctor.id,
      patientId: p2.patient.id,
      day: '2026-11-02',
      source: 'WALK_IN',
      checkin: '13:30',
      called: '14:00',
      done: '14:06',
      dx: 'Viêm họng cấp',
      icd: 'J02.9',
    });
    // Online đến sớm 20 phút, hẹn 09:00, được gọi 09:04 → chờ 4 phút (không tính 20 phút đến sớm)
    await visit({
      doctorId: d2.doctor.id,
      patientId: p2.patient.id,
      day: '2026-11-03',
      source: 'ONLINE',
      checkin: '08:40',
      appointmentAt: '09:00',
      called: '09:04',
      done: '09:14',
      dx: 'Tăng huyết áp',
      icd: 'I10',
    });
    // Đi cận lâm sàng: không tính vào thời gian khám; kết quả có sau 40 phút
    await visit({
      doctorId: d2.doctor.id,
      patientId: p1.patient.id,
      day: '2026-11-03',
      source: 'WALK_IN',
      checkin: '10:00',
      called: '10:10',
      done: '11:30',
      dx: 'Viêm phổi',
      lab: { sent: '10:20', ready: '11:00' },
    });
    // Bỏ về
    await visit({ doctorId: d1.doctor.id, patientId: p2.patient.id, day: '2026-11-04', source: 'WALK_IN', checkin: '09:00', status: 'LEFT' });

    // Đơn thuốc: đơn đã hoàn tất mới tính; đơn bị thay thì không tính
    const old = await prisma.prescription.create({
      data: {
        visitId: a.id,
        doctorId: d1.doctor.id,
        status: 'FINALIZED',
        items: { create: { medicineId: med.id, quantity: 99, dosePerTime: '1', timesPerDay: 2, days: 5 } },
      },
    });
    await prisma.prescription.create({
      data: {
        visitId: a.id,
        doctorId: d1.doctor.id,
        status: 'FINALIZED',
        replacesId: old.id,
        items: { create: { medicineId: med.id, quantity: 10, dosePerTime: '1', timesPerDay: 2, days: 5 } },
      },
    });
    await prisma.prescription.create({
      data: {
        visitId: a.id,
        doctorId: d1.doctor.id,
        status: 'DRAFT',
        items: { create: { medicineId: med.id, quantity: 50, dosePerTime: '1', timesPerDay: 2, days: 5 } },
      },
    });

    // Lịch hẹn: 1 đã khám, 1 không đến, 1 hủy, 1 tương lai (không tính vào tỷ lệ không đến)
    const appt = async (status: 'COMPLETED' | 'NO_SHOW' | 'CANCELLED' | 'PENDING', start: Date) => {
      const s = await prisma.schedule.create({
        data: { doctorId: d2.doctor.id, date: new Date(start.toISOString().slice(0, 10)), startTime: start, endTime: new Date(start.getTime() + 15 * MIN) },
      });
      await prisma.appointment.create({ data: { patientId: p2.patient.id, scheduleId: s.id, status } });
    };
    await appt('COMPLETED', vn('2026-11-03', '09:00'));
    await appt('NO_SHOW', vn('2026-11-03', '10:00'));
    await appt('CANCELLED', vn('2026-11-04', '10:00'));
    await appt('PENDING', vn('2026-11-07', '15:00'));

    const s = await app.get(StatsService).overview('2026-11-01', '2026-11-07', vn('2026-11-07', '12:00'));
    expect(s.kpis).toEqual({
      visits: 5,
      completed: 4,
      left: 1,
      patients: 2,
      newPatients: 1,
      onlineShare: 20,
      waitMedian: 15, // 20, 30, 4, 10
      waitOnlineMedian: 4,
      waitWalkInMedian: 20,
      examMedian: 10, // 10, 6, 10 (lượt đi cận lâm sàng bị loại)
      noShowRate: 50, // 1 không đến / 2 lịch đã tới giờ và không hủy
    });
    expect(s.previous).toMatchObject({ visits: 1, completed: 1, waitMedian: 40 });
    expect(s.daily.find((x) => x.date === '2026-11-02')).toEqual({ date: '2026-11-02', online: 0, walkIn: 2, completed: 2 });
    expect(s.daily.find((x) => x.date === '2026-11-03')).toEqual({ date: '2026-11-03', online: 1, walkIn: 1, completed: 2 });
    expect(s.hourly[0].hour).toBe(7);
    expect(s.hourly.find((h) => h.hour === 7)).toEqual({ hour: 7, online: 0, walkIn: 1 });
    expect(s.hourly.find((h) => h.hour === 8)).toEqual({ hour: 8, online: 1, walkIn: 0 });
    // Gộp chẩn đoán theo mã ICD (không phân biệt hoa thường)
    expect(s.diagnoses[0]).toEqual({ code: 'J02.9', name: 'Viêm họng cấp', count: 2 });
    expect(s.diagnoses).toHaveLength(3);
    expect(s.medicines).toEqual([{ name: 'Paracetamol', unit: 'viên', prescriptions: 1, quantity: 10 }]);
    expect(s.appointments).toEqual({ total: 4, completed: 1, noShow: 1, cancelled: 1, upcoming: 1 });
    expect(s.labs).toEqual({ visitsWithTests: 1, returnMode: 1, onlineMode: 0, turnaroundMedian: 40 });
    expect(s.doctors.map((d) => [d.completed, d.waitMedian])).toEqual([
      [2, 25],
      [2, 7],
    ]);
  });

  it('hoàn tất lượt khám thì ghi lại giờ hoàn tất', async () => {
    const reception = await createUser(app, prisma, 'RECEPTIONIST');
    const doctor = await createDoctor(app, prisma);
    const patient = await createPatient(app, prisma);
    const v = (await api(app).post('/api/queue/tickets').set(reception.auth).send({ patientId: patient.patient.id, doctorId: doctor.doctor.id }).expect(201))
      .body;
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).put(`/api/visits/${v.id}/record`).set(doctor.auth).send({ symptoms: 'Ho', diagnosis: 'Viêm họng' }).expect(200);
    await api(app).post(`/api/visits/${v.id}/complete`).set(doctor.auth).expect(200);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: v.id } })).completedAt).toBeInstanceOf(Date);
  });
});
