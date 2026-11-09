import type { INestApplication } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanFileName, detectLabFile, signedFilePath, verifyFileLink } from '../src/lab-results/utils/lab-files.util.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { imageSize } from '../src/visits/utils/record-export.util.js';
import { createDoctor, createPatient, createUser, nextPhone } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

/** Ảnh PNG thật (w×h điểm ảnh, màu xám) để pdfmake và docx nhúng được. */
function png(w: number, h: number) {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bit
  ihdr[9] = 0; // xám
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 0x80)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PDF = Buffer.from('%PDF-1.4\n% phiếu siêu âm\n');

describe('Cận lâm sàng: chỉ định, gửi đi, trả kết quả', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let patient: Awaited<ReturnType<typeof createPatient>>;
  let reception: { Authorization: string };

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    doctor = await createDoctor(app, prisma);
    patient = await createPatient(app, prisma);
    reception = (await createUser(app, prisma, 'RECEPTIONIST')).auth;
  });
  afterAll(async () => app.close());

  const record = { symptoms: 'Ho, sốt 3 ngày', diagnosis: 'Viêm phổi?' };

  /** Bệnh nhân lấy số rồi được gọi vào khám, bác sĩ ghi bệnh án và một chỉ định. */
  async function examWithOrder(name = 'X-quang ngực thẳng') {
    const ticket = await api(app).post('/api/queue/tickets').set(reception).send({ patientId: patient.patient.id, doctorId: doctor.doctor.id }).expect(201);
    const visitId = ticket.body.id as string;
    await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    await api(app).put(`/api/visits/${visitId}/record`).set(doctor.auth).send(record).expect(200);
    const order = await api(app).post(`/api/visits/${visitId}/lab-orders`).set(doctor.auth).send({ name, note: 'Tư thế đứng' }).expect(201);
    return { visitId, orderId: order.body.id as string };
  }
  const walkIn = async () => {
    const p = await prisma.patient.create({ data: { fullName: 'Bà Tư', phone: nextPhone(), dateOfBirth: new Date('1960-02-02'), gender: 'FEMALE' } });
    return (await api(app).post('/api/queue/tickets').set(reception).send({ patientId: p.id, doctorId: doctor.doctor.id }).expect(201)).body;
  };
  const upload = (orderId: string, data: Buffer, name: string) =>
    api(app).post(`/api/lab-orders/${orderId}/files`).set(doctor.auth).attach('file', data, name);
  const giveResult = async (orderId: string) => {
    await upload(orderId, png(40, 30), 'phim-phổi.png').expect(201);
    await api(app).patch(`/api/lab-orders/${orderId}`).set(doctor.auth).send({ resultText: 'Đám mờ thùy dưới phổi phải', done: true }).expect(200);
  };

  it('gửi đi cận lâm sàng thì bác sĩ gọi được người tiếp theo; có kết quả quay lại được gọi trước', async () => {
    const { visitId, orderId } = await examWithOrder();
    await walkIn();
    const sent = await api(app).post(`/api/visits/${visitId}/send-for-tests`).set(doctor.auth).send({ mode: 'RETURN' }).expect(200);
    expect(sent.body).toMatchObject({ status: 'AWAITING_RESULTS', resultMode: 'RETURN', labOrders: [{ name: 'X-quang ngực thẳng', doneAt: null }] });

    // Bác sĩ không bị "đang khám" giữ lại
    const next = await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    expect(next.body.patient.fullName).toBe('Bà Tư');
    const awaiting = await api(app).get('/api/lab/awaiting-visits').set(doctor.auth).expect(200);
    expect(awaiting.body.map((v: { id: string }) => v.id)).toEqual([visitId]);

    // Chưa có kết quả thì chưa đưa lại hàng chờ được
    expect((await api(app).post(`/api/visits/${visitId}/results-ready`).set(doctor.auth).expect(409)).body.message).toMatch(/Chưa trả kết quả: X-quang/);
    await giveResult(orderId);
    await api(app).post(`/api/visits/${visitId}/results-ready`).set(doctor.auth).expect(200);
    await walkIn();
    await api(app).patch(`/api/queue/${next.body.id}/left`).set(doctor.auth).expect(200);

    const back = await api(app).post('/api/queue/call-next').set(doctor.auth).expect(200);
    expect([back.body.id, back.body.callRule]).toEqual([visitId, 'RESULTS']);
    // Chế độ quay lại thì không hoàn tất được khi bệnh nhân chưa vào lại; giờ đã vào thì được
    await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(200);
  });

  it('nhận kết quả online: bác sĩ hoàn tất khi chưa gặp lại, bệnh nhân chỉ thấy kết quả sau khi hoàn tất', async () => {
    const { visitId, orderId } = await examWithOrder('Siêu âm ổ bụng');
    await api(app).post(`/api/visits/${visitId}/send-for-tests`).set(doctor.auth).send({ mode: 'ONLINE' }).expect(200);
    await upload(orderId, PDF, 'phieu-sieu-am.pdf').expect(201);
    await api(app).patch(`/api/lab-orders/${orderId}`).set(doctor.auth).send({ resultText: 'Gan nhiễm mỡ độ I', done: true }).expect(200);

    // Trong lúc chờ: lịch sử của bệnh nhân có lượt này nhưng chưa thấy kết quả
    const history = await api(app).get('/api/visits/mine').set(patient.auth).expect(200);
    expect(history.body[0]).toMatchObject({ id: visitId, status: 'AWAITING_RESULTS', resultMode: 'ONLINE' });
    const hidden = await api(app).get(`/api/visits/${visitId}`).set(patient.auth).expect(200);
    expect(hidden.body.labOrders).toEqual([expect.objectContaining({ name: 'Siêu âm ổ bụng', resultText: null, files: [] })]);

    await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(200);
    const shown = await api(app).get(`/api/visits/${visitId}`).set(patient.auth).expect(200);
    const [o] = shown.body.labOrders;
    expect(o).toMatchObject({ resultText: 'Gan nhiễm mỡ độ I', files: [{ fileName: 'phieu-sieu-am.pdf', mimeType: 'application/pdf' }] });

    // Mở tệp bằng đường dẫn có chữ ký, không cần đăng nhập; sửa chữ ký thì bị từ chối
    const file = await api(app).get(`/api${o.files[0].url}`).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    await api(app).get(`/api${o.files[0].url.replace(/sig=./, 'sig=x')}`).expect(404);
  });

  it('kiểm tra khi trả kết quả, gửi đi và hoàn tất', async () => {
    const { visitId, orderId } = await examWithOrder();
    // Trả kết quả mà chưa có mô tả hay tệp
    await api(app).patch(`/api/lab-orders/${orderId}`).set(doctor.auth).send({ done: true }).expect(400);
    // Tệp không phải ảnh hay PDF
    expect((await upload(orderId, Buffer.from('MZ fake exe'), 'virus.exe').expect(400)).body.message).toMatch(/JPG, PNG hoặc tệp PDF/);
    // Còn chỉ định chưa có kết quả thì chưa hoàn tất được
    expect((await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(409)).body.message).toMatch(/Chưa trả kết quả/);
    await api(app).post(`/api/visits/${visitId}/send-for-tests`).set(doctor.auth).send({ mode: 'MAYBE' }).expect(400);
    await api(app).post(`/api/visits/${visitId}/send-for-tests`).set(doctor.auth).send({ mode: 'RETURN' }).expect(200);
    // Chế độ quay lại: không hoàn tất khi bệnh nhân chưa vào lại
    await giveResult(orderId);
    expect((await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(409)).body.message).toMatch(/đưa vào hàng chờ/);
    // Đã có tệp thì không xóa chỉ định được
    await api(app).delete(`/api/lab-orders/${orderId}`).set(doctor.auth).expect(409);
    // Bác sĩ khác không thấy, không sửa được
    const other = await createDoctor(app, prisma);
    await api(app).patch(`/api/lab-orders/${orderId}`).set(other.auth).send({ resultText: 'x' }).expect(404);
    // Bệnh nhân không gọi được API của bác sĩ
    await api(app).post(`/api/visits/${visitId}/lab-orders`).set(patient.auth).send({ name: 'CT sọ não' }).expect(403);
  });

  it('chỉ định chưa có kết quả thì xóa được; xóa tệp, mở lại chỉ định', async () => {
    const { visitId, orderId } = await examWithOrder();
    const second = await api(app).post(`/api/visits/${visitId}/lab-orders`).set(doctor.auth).send({ name: 'Công thức máu' }).expect(201);
    await api(app).delete(`/api/lab-orders/${second.body.id}`).set(doctor.auth).expect(204);
    const withFile = await upload(orderId, png(8, 8), 'a.png').expect(201);
    await api(app).patch(`/api/lab-orders/${orderId}`).set(doctor.auth).send({ done: true }).expect(200);
    const reopened = await api(app).patch(`/api/lab-orders/${orderId}`).set(doctor.auth).send({ done: false }).expect(200);
    expect(reopened.body.doneAt).toBeNull();
    const after = await api(app).delete(`/api/lab-files/${withFile.body.files[0].id}`).set(doctor.auth).expect(200);
    expect(after.body.files).toEqual([]);
    await api(app).delete(`/api/lab-orders/${orderId}`).set(doctor.auth).expect(204);
  });

  it('bệnh án xuất ra có phiếu kết quả cận lâm sàng kèm ảnh', async () => {
    const { visitId, orderId } = await examWithOrder();
    await giveResult(orderId);
    await upload(orderId, PDF, 'ket-qua-goc.pdf').expect(201);
    await api(app).post(`/api/visits/${visitId}/complete`).set(doctor.auth).expect(200);

    const html = await api(app).get(`/api/visits/${visitId}/record.html`).set(patient.auth).expect(200);
    expect(html.headers['content-security-policy']).toMatch(/img-src data:/);
    expect(html.text).toContain('PHIẾU KẾT QUẢ CẬN LÂM SÀNG');
    expect(html.text).toContain('4. Chỉ định cận lâm sàng: </span><span class="">X-quang ngực thẳng (kết quả ở phiếu kết quả cận lâm sàng)');
    expect(html.text).toContain('Đám mờ thùy dưới phổi phải');
    expect(html.text).toMatch(/<img src="data:image\/png;base64,/);
    expect(html.text).toContain('Tệp đính kèm (xem trên hệ thống): ket-qua-goc.pdf');

    const pdf = await api(app).get(`/api/visits/${visitId}/record.pdf`).set(patient.auth).buffer().expect(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.body.toString('latin1')).toMatch(/\/Subtype \/Image/);
    const docx = await api(app)
      .get(`/api/visits/${visitId}/record.docx`)
      .set(patient.auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const files = Object.keys(unzipSync(new Uint8Array(docx.body as Buffer)));
    expect(files.some((f) => f.startsWith('word/media/'))).toBe(true);
  });
});

describe('Tệp kết quả', () => {
  it('nhận diện loại tệp theo nội dung', () => {
    expect(detectLabFile(png(2, 2))).toBe('image/png');
    expect(detectLabFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectLabFile(PDF)).toBe('application/pdf');
    expect(detectLabFile(Buffer.from('GIF89a'))).toBeNull();
  });

  it('giữ tên tệp tiếng Việt, bỏ đường dẫn; thiếu tên thì đặt tên theo loại', () => {
    expect(cleanFileName(Buffer.from('C:\\phim\\X-quang phổi.png', 'utf8').toString('latin1'), 'image/png')).toBe('X-quang phổi.png');
    expect(cleanFileName('', 'application/pdf')).toBe('ket-qua.pdf');
  });

  it('đường dẫn có chữ ký hết hạn sau 1 giờ', () => {
    const now = Date.parse('2026-11-07T03:00:00Z');
    const url = new URL(`http://x${signedFilePath('bí mật', 'f1', now)}`);
    const [exp, sig] = [url.searchParams.get('exp')!, url.searchParams.get('sig')!];
    expect(verifyFileLink('bí mật', 'f1', exp, sig, now + 59 * 60_000)).toBe(true);
    expect(verifyFileLink('bí mật', 'f1', exp, sig, now + 61 * 60_000)).toBe(false);
    expect(verifyFileLink('bí mật', 'f2', exp, sig, now)).toBe(false);
    expect(verifyFileLink('khác', 'f1', exp, sig, now)).toBe(false);
  });

  it('đọc kích thước ảnh PNG và JPEG', () => {
    expect(imageSize(png(40, 30))).toEqual({ width: 40, height: 30 });
    // JPEG tối giản: SOI, APP0 (độ dài 16), SOF0 cao 480 rộng 640
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]))).toEqual({ width: 640, height: 480 });
    expect(imageSize(Buffer.from('not an image'))).toBeNull();
  });
});
