import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { todayVN } from '../src/common/time.js';
import { currentYearVN, detectImage, experienceYears, joinExpertise, newestFirst, splitExpertise } from '../src/doctors/doctor-profile.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createDoctor, createPatient, createUser } from './fixtures.js';
import { api, createTestApp, resetDb } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('anh-thu')]);
const YEAR = currentYearVN();

describe('Hồ sơ bác sĩ: hàm thuần', () => {
  it('thế mạnh lưu mỗi dòng một mục, bỏ trùng và dòng trống', () => {
    expect(joinExpertise([' Tăng huyết áp ', 'Đái tháo đường', 'Tăng huyết áp', ''])).toBe('Tăng huyết áp\nĐái tháo đường');
    expect(joinExpertise([])).toBeNull();
    expect(splitExpertise(null)).toEqual([]);
    expect(splitExpertise('A\nB')).toEqual(['A', 'B']);
  });

  it('việc đang làm đứng đầu, rồi theo năm kết thúc giảm dần', () => {
    const list = [
      { title: 'cũ', fromYear: 2005, toYear: 2010 },
      { title: 'nay', fromYear: 2018, toYear: null },
      { title: 'giữa', fromYear: 2010, toYear: 2018 },
    ];
    expect(newestFirst(list).map((e) => e.title)).toEqual(['nay', 'giữa', 'cũ']);
  });

  it('năm kinh nghiệm và năm hiện tại tính theo giờ Việt Nam', () => {
    // 17:30 UTC ngày 31/12 = 00:30 ngày 1/1 ở Việt Nam
    expect(currentYearVN(new Date('2026-12-31T17:30:00Z'))).toBe(2027);
    expect(experienceYears(2011, new Date('2026-06-01T00:00:00Z'))).toBe(15);
    expect(experienceYears(null)).toBeNull();
  });

  it('nhận diện ảnh theo nội dung, không theo tên file', () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImage(PNG)).toBe('image/png');
    expect(detectImage(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(detectImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });
});

describe('Hồ sơ bác sĩ: API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: { Authorization: string };
  let doctor: Awaited<ReturnType<typeof createDoctor>>;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    admin = (await createUser(app, prisma, 'ADMIN')).auth;
    doctor = await createDoctor(app, prisma);
  });
  afterAll(async () => app.close());

  const profile = {
    bio: 'Khám và điều trị bệnh nội khoa',
    practiceSince: 2011,
    expertise: ['Tăng huyết áp', 'Đái tháo đường'],
    education: [{ fromYear: 2005, toYear: 2011, title: 'Bác sĩ đa khoa', place: 'Đại học Y Hà Nội' }],
    career: [
      { fromYear: 2011, toYear: 2018, title: 'Bác sĩ điều trị', place: 'Bệnh viện Bạch Mai' },
      { fromYear: 2018, toYear: null, title: 'Trưởng khoa Nội', place: 'Phòng khám Đa khoa' },
    ],
  };

  it('API công khai không lộ số điện thoại và email của bác sĩ; admin vẫn thấy', async () => {
    const pub = await api(app).get('/api/doctors').expect(200);
    expect(pub.body.items[0].user).toEqual({ fullName: doctor.user.fullName });
    const one = await api(app).get(`/api/doctors/${doctor.doctor.id}`).expect(200);
    expect(one.body.user).toEqual({ fullName: doctor.user.fullName });
    const all = await api(app).get('/api/doctors/all').set(admin).expect(200);
    expect(all.body.items[0].user.phone).toBe(doctor.user.phone);
  });

  it('admin nhập hồ sơ; bệnh nhân xem quá trình công tác, việc hiện tại đứng đầu', async () => {
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin).send(profile).expect(200);
    const res = await api(app).get(`/api/doctors/${doctor.doctor.id}`).expect(200);
    expect(res.body).toMatchObject({
      bio: 'Khám và điều trị bệnh nội khoa',
      practiceSince: 2011,
      experienceYears: YEAR - 2011,
      expertise: ['Tăng huyết áp', 'Đái tháo đường'],
      avatarVersion: null,
      education: [{ title: 'Bác sĩ đa khoa', place: 'Đại học Y Hà Nội', fromYear: 2005, toYear: 2011 }],
    });
    expect(res.body.career.map((c: { title: string; toYear: number | null }) => [c.title, c.toYear])).toEqual([
      ['Trưởng khoa Nội', null],
      ['Bác sĩ điều trị', 2018],
    ]);
  });

  it('gửi danh sách mới thì thay toàn bộ danh sách cũ; không gửi thì giữ nguyên', async () => {
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin).send(profile).expect(200);
    await api(app)
      .patch(`/api/doctors/${doctor.doctor.id}`)
      .set(admin)
      .send({ career: [{ fromYear: 2020, title: 'Phó khoa Nội', place: 'Phòng khám Đa khoa' }] })
      .expect(200);
    const res = await api(app).get(`/api/doctors/${doctor.doctor.id}`).expect(200);
    expect(res.body.career).toHaveLength(1);
    expect(res.body.career[0]).toMatchObject({ title: 'Phó khoa Nội', toYear: null });
    expect(res.body.education).toHaveLength(1);
  });

  it('danh sách bác sĩ kèm số chỗ trống hôm nay và công việc hiện tại; xem giờ đã đặt khi cần', async () => {
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin).send(profile).expect(200);
    const at = (min: number) => new Date(Date.now() + min * 60_000);
    await prisma.schedule.createMany({
      data: [
        { doctorId: doctor.doctor.id, date: todayVN(), startTime: at(30), endTime: at(45) },
        { doctorId: doctor.doctor.id, date: todayVN(), startTime: at(45), endTime: at(60), isBooked: true },
        { doctorId: doctor.doctor.id, date: todayVN(), startTime: at(-60), endTime: at(-45) },
      ],
    });
    const list = await api(app).get('/api/doctors').expect(200);
    expect(list.body.items[0]).toMatchObject({ freeToday: 1, currentPosition: 'Trưởng khoa Nội · Phòng khám Đa khoa' });
    const ymd = todayVN().toISOString().slice(0, 10);
    expect((await api(app).get(`/api/doctors/${doctor.doctor.id}/schedules?date=${ymd}`).expect(200)).body).toHaveLength(1);
    const all = await api(app).get(`/api/doctors/${doctor.doctor.id}/schedules?date=${ymd}&all=true`).expect(200);
    expect(all.body.map((x: { isBooked: boolean }) => x.isBooked)).toEqual([false, true]);
    expect(new Date(all.body[0].startTime).getTime() - new Date(all.body[0].checkinOpensAt).getTime()).toBe(30 * 60_000);
  });

  it('năm không hợp lệ thì báo lỗi rõ ràng', async () => {
    const send = (body: object) => api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin).send(body).expect(400);
    expect((await send({ career: [{ fromYear: 2015, toYear: 2010, title: 'Bác sĩ', place: 'Bệnh viện A' }] })).body.message).toBe(
      '"Bác sĩ": năm kết thúc phải từ năm bắt đầu trở đi',
    );
    expect((await send({ career: [{ fromYear: YEAR + 1, title: 'Bác sĩ', place: 'Bệnh viện A' }] })).body.message).toBe(
      '"Bác sĩ": năm bắt đầu không được sau năm hiện tại',
    );
    expect((await send({ education: [{ fromYear: 2015, toYear: YEAR + 1, title: 'Nội trú', place: 'Đại học Y' }] })).body.message).toMatch(
      /năm kết thúc không được sau năm hiện tại/,
    );
    expect((await send({ practiceSince: YEAR + 1 })).body.message).toBe('Năm bắt đầu hành nghề không được sau năm hiện tại');
  });

  it('bác sĩ tự sửa hồ sơ nhưng không đổi được học vị; vai trò khác không sửa được', async () => {
    const res = await api(app)
      .patch('/api/doctors/me')
      .set(doctor.auth)
      .send({ bio: 'Tự giới thiệu', title: 'GS.TS', career: profile.career })
      .expect(200);
    expect(res.body).toMatchObject({ bio: 'Tự giới thiệu', title: null });
    expect(res.body.career).toHaveLength(2);
    expect((await api(app).get('/api/doctors/me').set(doctor.auth).expect(200)).body.id).toBe(doctor.doctor.id);

    const patient = await createPatient(app, prisma);
    await api(app).patch('/api/doctors/me').set(patient.auth).send({ bio: 'x' }).expect(403);
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(doctor.auth).send({ bio: 'x' }).expect(403);
  });

  it('bác sĩ đã khóa không hiện hồ sơ công khai; admin vẫn xem để sửa', async () => {
    await api(app).patch(`/api/doctors/${doctor.doctor.id}`).set(admin).send({ isActive: false }).expect(200);
    await api(app).get(`/api/doctors/${doctor.doctor.id}`).expect(404);
    expect((await api(app).get(`/api/doctors/${doctor.doctor.id}/full`).set(admin).expect(200)).body.user.isActive).toBe(false);
  });

  it('ảnh đại diện: chỉ nhận ảnh thật, tối đa 2 MB; xem công khai; xóa được', async () => {
    const id = doctor.doctor.id;
    await api(app).post('/api/doctors/me/avatar').set(doctor.auth).expect(400);
    const fake = await api(app).post('/api/doctors/me/avatar').set(doctor.auth).attach('file', Buffer.from('<svg/>'), 'a.png').expect(400);
    expect(fake.body.message).toBe('Ảnh phải là JPG, PNG hoặc WebP');
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await api(app).post('/api/doctors/me/avatar').set(doctor.auth).attach('file', big, 'a.png').expect(400)).body.message).toBe(
      'Ảnh tối đa 2 MB',
    );

    const up = await api(app).post('/api/doctors/me/avatar').set(doctor.auth).attach('file', PNG, 'anh.png').expect(200);
    expect(up.body.avatarVersion).toEqual(expect.any(Number));
    const img = await api(app).get(`/api/doctors/${id}/avatar`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(img.body as Buffer, PNG)).toBe(0);

    await api(app).delete(`/api/doctors/${id}/avatar`).set(admin).expect(200);
    await api(app).get(`/api/doctors/${id}/avatar`).expect(404);
    await api(app).post(`/api/doctors/${id}/avatar`).set(admin).attach('file', PNG, 'anh.png').expect(200);
    await api(app).delete('/api/doctors/me/avatar').set(doctor.auth).expect(200);
    await api(app).get(`/api/doctors/${id}/avatar`).expect(404);
  });

  it('số giờ còn trống từng ngày trong 7 ngày tới', async () => {
    const id = doctor.doctor.id;
    const tomorrow = new Date(todayVN().getTime() + 86_400_000);
    const at = (msFromNow: number) => new Date(Date.now() + msFromNow);
    await prisma.schedule.createMany({
      data: [
        { doctorId: id, date: tomorrow, startTime: at(86_400_000), endTime: at(86_400_000 + 900_000) },
        { doctorId: id, date: tomorrow, startTime: at(86_400_000 + 900_000), endTime: at(86_400_000 + 1_800_000) },
        { doctorId: id, date: tomorrow, startTime: at(86_400_000 + 1_800_000), endTime: at(86_400_000 + 2_700_000), isBooked: true },
      ],
    });
    const res = await api(app).get(`/api/doctors/${id}/availability`).expect(200);
    expect(res.body).toHaveLength(7);
    expect(res.body[1]).toEqual({ date: tomorrow.toISOString().slice(0, 10), free: 2 });
    expect(res.body[0].free).toBe(0);
    expect((await api(app).get(`/api/doctors/${id}/availability?days=3`).expect(200)).body).toHaveLength(3);
    await api(app).get('/api/doctors/khong-co/availability').expect(404);
  });
});
