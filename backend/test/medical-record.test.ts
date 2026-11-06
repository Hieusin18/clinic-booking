import type { INestApplication } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import type { Response } from 'superagent';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vnDateString } from '../src/common/time.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { buildPrintDoc, medicineLabel } from '../src/visits/record-export.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

/** Đọc thân response dạng nhị phân (PDF, DOCX). */
const binary = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const day = (n: number) => vnDateString(new Date(Date.now() + n * 86_400_000));
/** Nội dung chữ của file Word (word/document.xml). */
const docxText = (buf: Buffer) => strFromU8(unzipSync(new Uint8Array(buf))['word/document.xml']).replace(/<[^>]+>/g, '');

describe('Bệnh án theo mẫu Bộ Y tế và bản điện tử PDF/Word', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let patient: Awaited<ReturnType<typeof createPatient>>;
  let reception: { Authorization: string };
  let medId: string;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    doctor = await createDoctor(app, prisma);
    patient = await createPatient(app, prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
    medId = (await prisma.medicine.create({ data: { name: 'Hapacol 250', activeIngredient: 'Paracetamol', strength: '250mg', unit: 'gói' } })).id;
  });
  afterAll(async () => app.close());

  async function startVisit() {
    const ticket = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: patient.patient.id, doctorId: doctor.doctor.id, reason: 'Sốt, đau họng' }).expect(201);
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    return ticket.body.id as string;
  }

  const full = () => ({
    reason: 'Sốt, đau họng 2 ngày',
    symptoms: 'Sốt 38,5 độ, đau rát họng tăng khi nuốt',
    personalHistory: 'Chưa phát hiện bệnh lý',
    familyHistory: '',
    pulse: 88,
    temperature: 38.2,
    bpSystolic: 120,
    bpDiastolic: 75,
    respiratoryRate: 18,
    spo2: 98,
    weight: 68,
    height: 172,
    generalExam: 'Tỉnh, tiếp xúc tốt',
    organExam: 'Họng đỏ, amidan sưng nhẹ',
    orders: 'Công thức máu',
    diagnosis: 'Viêm họng cấp',
    icdCode: ' j02.9 ',
    secondaryDiagnosis: 'Viêm mũi dị ứng',
    secondaryIcdCodes: 'j30.4,J31.0',
    treatment: 'Hạ sốt, kháng sinh 5 ngày',
    followUpDate: day(5),
  });

  it('lưu đủ các mục: sinh hiệu, mã ICD-10 chuẩn hóa, ô trống thành null', async () => {
    const visitId = await startVisit();
    const res = await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(full()).expect(200);
    expect(res.body).toMatchObject({ pulse: 88, temperature: 38.2, bpSystolic: 120, icdCode: 'J02.9', secondaryIcdCodes: 'J30.4, J31.0', familyHistory: null });
    expect(res.body.followUpDate.slice(0, 10)).toBe(day(5));

    // Xóa một ô đã nhập (gửi chuỗi rỗng / null) thì giá trị cũ bị xóa
    const cleared = await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send({ ...full(), organExam: '', pulse: null, icdCode: '' }).expect(200);
    expect(cleared.body).toMatchObject({ organExam: null, pulse: null, icdCode: null });
  });

  it('chặn dữ liệu sai: mã ICD, sinh hiệu ngoài khoảng, huyết áp thiếu/ngược, tái khám không sau ngày khám', async () => {
    const visitId = await startVisit();
    const put = (patch: object) => api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send({ ...full(), ...patch });
    await put({ icdCode: 'viêm họng' }).expect(400);
    await put({ secondaryIcdCodes: 'J30.4;J31' }).expect(400);
    await put({ temperature: 50 }).expect(400);
    await put({ spo2: 101 }).expect(400);
    expect((await put({ bpDiastolic: null }).expect(400)).body.message).toBe('Nhập đủ cả huyết áp tâm thu và tâm trương');
    expect((await put({ bpSystolic: 70, bpDiastolic: 90 }).expect(400)).body.message).toBe('Huyết áp tâm thu phải lớn hơn tâm trương');
    expect((await put({ followUpDate: day(0) }).expect(400)).body.message).toBe('Ngày tái khám phải sau ngày khám');
    await put({ followUpDate: '2026-13-40' }).expect(400);
  });

  it('tra mã ICD-10 không cần gõ dấu; chỉ bác sĩ dùng được', async () => {
    const res = await api(app).get('/api/icd10?q=viem hong').set(doctor.auth).expect(200);
    expect(res.body[0]).toEqual({ code: 'J02.9', name: 'Viêm họng cấp, không đặc hiệu' });
    // "hong" chỉ khớp đầu từ: không lôi ra mọi bệnh có chữ "không đặc hiệu"
    expect(res.body.map((x: { code: string }) => x.code)).not.toContain('J01.9');
    expect((await api(app).get('/api/icd10?q=j02').set(doctor.auth).expect(200)).body[0].code).toBe('J02.9');
    expect((await api(app).get('/api/icd10?q=I10').set(doctor.auth).expect(200)).body[0].code).toBe('I10');
    await api(app).get('/api/icd10?q=viem').set(patient.auth).expect(403);
  });

  it('hoàn tất đơn thì được cấp mã đơn thuốc dạng xxxxxyyyyyyy-z', async () => {
    const visitId = await startVisit();
    const rx = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth)
      .send({ items: [{ medicineId: medId, quantity: 6, dosePerTime: '1 gói', timesPerDay: 3, days: 2 }] }).expect(201);
    expect(rx.body.code).toBeNull();
    const done = await api(app).post(`/api/prescriptions/${rx.body.id}/finalize`).set(doctor.auth).expect(200);
    expect(done.body.code).toMatch(/^PK001[0-9a-z]{7}-C$/);
  });

  describe('Tải bản điện tử', () => {
    async function finishedVisit() {
      const visitId = await startVisit();
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(full()).expect(200);
      const rx = await api(app).post(`/api/visits/${visitId}/prescriptions`).set(doctor.auth)
        .send({ advice: 'Uống nhiều nước', items: [{ medicineId: medId, quantity: 6, dosePerTime: '1 gói', timesPerDay: 3, days: 2, note: 'Khi sốt' }] }).expect(201);
      await api(app).post(`/api/prescriptions/${rx.body.id}/finalize`).set(doctor.auth).expect(200);
      await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(200);
      return visitId;
    }

    it('bác sĩ và bệnh nhân tải được PDF', async () => {
      const visitId = await finishedVisit();
      for (const who of [doctor.auth, patient.auth]) {
        const res = await api(app).get(`/api/visits/${visitId}/record.pdf`).set(who).buffer(true).parse(binary).expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toMatch(/^attachment; filename="benh-an-BA-\d{8}-\d{3}\.pdf"$/);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }
    });

    it('file Word có đủ bệnh án và đơn thuốc', async () => {
      const visitId = await finishedVisit();
      const res = await api(app).get(`/api/visits/${visitId}/record.docx`).set(patient.auth).buffer(true).parse(binary).expect(200);
      expect(res.headers['content-type']).toContain('wordprocessingml');
      const text = docxText(res.body as Buffer);
      for (const s of ['BỆNH ÁN NGOẠI TRÚ', 'I. HÀNH CHÍNH', 'V. CHẨN ĐOÁN', 'Viêm họng cấp', 'J02.9', '120/75 mmHg', 'ĐƠN THUỐC', 'Paracetamol (Hapacol 250) 250mg', 'SL: 06 gói', 'Uống nhiều nước', patient.patient.fullName.toUpperCase()]) {
        expect(text).toContain(s);
      }
    });

    it('xem trước HTML cùng nội dung, chặn script và tài nguyên ngoài', async () => {
      const visitId = await finishedVisit();
      // Dữ liệu người dùng chứa thẻ HTML phải hiện thành chữ, không thành thẻ
      await prisma.patient.update({ where: { id: patient.patient.id }, data: { address: '<script>alert(1)</script> Hà Nội' } });
      const res = await api(app).get(`/api/visits/${visitId}/record.html`).set(patient.auth).expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      for (const s of ['BỆNH ÁN NGOẠI TRÚ', 'ĐƠN THUỐC', 'Viêm họng cấp', 'SL: 06 gói', '&lt;script&gt;alert(1)&lt;/script&gt; Hà Nội']) expect(res.text).toContain(s);
      expect(res.text).not.toContain('<script>');
      await api(app).get(`/api/visits/${visitId}/record.html`).set(doctor.auth).expect(200);
      await api(app).get(`/api/visits/${visitId}/record.html`).set((await createPatient(app, prisma)).auth).expect(404);
      await api(app).get(`/api/visits/${visitId}/record.html`).set(reception).expect(403);
    });

    it('chưa có bệnh án thì báo lỗi; người khác không tải được', async () => {
      const visitId = await startVisit();
      expect((await api(app).get(`/api/visits/${visitId}/record.pdf`).set(doctor.auth).expect(409)).body.message).toBe('Lượt khám chưa có bệnh án');
      await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(full()).expect(200);
      const stranger = await createPatient(app, prisma);
      const other = await createDoctor(app, prisma);
      await api(app).get(`/api/visits/${visitId}/record.pdf`).set(stranger.auth).expect(404);
      await api(app).get(`/api/visits/${visitId}/record.docx`).set(other.auth).expect(404);
      await api(app).get(`/api/visits/${visitId}/record.pdf`).set(reception).expect(403);
    });
  });

  it('hồ sơ hành chính có nghề nghiệp, dân tộc, người nhà, hạn thẻ BHYT', async () => {
    const res = await api(app).patch('/api/patients/me').set(patient.auth)
      .send({ occupation: 'Giáo viên', ethnicity: 'Kinh', relativeName: 'Trần Văn B', relativePhone: '0912345678', insuranceNo: 'GD4010123456789', insuranceExpiry: '2026-12-31' })
      .expect(200);
    expect(res.body).toMatchObject({ occupation: 'Giáo viên', ethnicity: 'Kinh', relativeName: 'Trần Văn B', relativePhone: '0912345678' });
    expect(res.body.insuranceExpiry.slice(0, 10)).toBe('2026-12-31');
    await api(app).patch('/api/patients/me').set(patient.auth).send({ relativePhone: '12345' }).expect(400);
  });
});

describe('Mẫu in', () => {
  it('tên thuốc theo hoạt chất, tên thương mại trong ngoặc', () => {
    expect(medicineLabel({ name: 'Hapacol 250', activeIngredient: 'Paracetamol', strength: '250mg' })).toBe('Paracetamol (Hapacol 250) 250mg');
    expect(medicineLabel({ name: 'Paracetamol', activeIngredient: 'Paracetamol', strength: '500mg' })).toBe('Paracetamol 500mg');
  });

  it('trẻ dưới 72 tháng: ghi tuổi theo tháng, cân nặng và người đưa trẻ đến khám', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const doc = buildPrintDoc({
      id: 'v1', date: d('2026-11-06'), queueNumber: 3, source: 'WALK_IN', createdAt: new Date('2026-11-06T02:00:00Z'),
      patient: { id: 'p1', fullName: 'Bé An', dateOfBirth: d('2024-02-10'), gender: 'MALE', phone: '0900000009', nationalId: null, address: null, insuranceNo: null, insuranceExpiry: null, allergies: null, occupation: null, ethnicity: null, relativeName: 'Nguyễn Thị Mẹ', relativePhone: null },
      doctor: { title: 'BS', user: { fullName: 'Lê Minh Châu' }, specialty: { name: 'Nhi khoa' } },
      medicalRecord: { reason: null, symptoms: 'Sốt', personalHistory: null, familyHistory: null, pulse: null, temperature: 38, bpSystolic: null, bpDiastolic: null, respiratoryRate: null, spo2: null, weight: 12.5, height: null, generalExam: null, organExam: null, labSummary: null, orders: null, diagnosis: 'Sốt', icdCode: 'R50.9', secondaryDiagnosis: null, secondaryIcdCodes: null, treatment: null, followUpDate: null },
      prescription: { id: 'rx1', code: 'PK001abcdefg-C', advice: null, finalizedAt: null, items: [{ quantity: 4, dosePerTime: '1 gói', timesPerDay: 2, days: 2, note: null, medicine: { name: 'Hapacol 250', activeIngredient: 'Paracetamol', strength: '250mg', unit: 'gói' } }] },
    });
    const rx = JSON.stringify(doc.pages[1]);
    expect(rx).toContain('"label":"Tuổi","value":"32 tháng"');
    expect(rx).toContain('12,5 kg');
    expect(rx).toContain('"label":"Họ tên người đưa trẻ đến khám bệnh, chữa bệnh","value":"Nguyễn Thị Mẹ"');
    expect(rx).toContain('SL: 04 gói');
  });
});
