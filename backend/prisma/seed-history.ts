/**
 * Dữ liệu lịch sử MẪU cho trang Thống kê khi demo (bệnh nhân hư cấu, số liệu sinh ngẫu nhiên có quy luật).
 * Không dùng trên hệ thống thật. Chạy sau `prisma db seed` (cần bác sĩ, chuyên khoa và danh mục thuốc).
 *
 *   npx tsx prisma/seed-history.ts            # 60 ngày gần nhất (bỏ Chủ nhật và những ngày đã có lượt khám thật)
 *   npx tsx prisma/seed-history.ts --days 90
 *   npx tsx prisma/seed-history.ts --reset    # xóa dữ liệu mẫu đã tạo
 *
 * Bệnh nhân mẫu có số điện thoại 0989xxxxxx; xóa được trọn vẹn bằng --reset.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const PHONE_PREFIX = '0989';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const VN = 7 * 60 * MINUTE;

// ---- Ngẫu nhiên có hạt giống: chạy lại cho cùng kết quả ----
let seed = 20261108;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
/** Lệch phải như thời gian chờ thật: phần lớn ngắn, ít lượt rất lâu */
const skewed = (min: number, typical: number, max: number) => Math.min(max, min + (typical - min) * -Math.log(1 - rand() * 0.95));
function weighted<T>(xs: readonly [T, number][]) {
  let r = rand() * xs.reduce((n, [, w]) => n + w, 0);
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[xs.length - 1][0];
}

/** Giờ Việt Nam của ngày `ymd` → Date */
const at = (ymd: string, minutesOfDay: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) - VN + minutesOfDay * MINUTE);

// ---- Danh mục chẩn đoán theo chuyên khoa (mã ICD-10, thuốc thường kê) ----
type Dx = { code: string; name: string; weight: number; meds: string[]; lab?: string };
const DIAGNOSES: Record<string, Dx[]> = {
  'Nội tổng quát': [
    { code: 'J06.9', name: 'Nhiễm trùng đường hô hấp trên cấp', weight: 9, meds: ['Paracetamol', 'Acetylcystein', 'Vitamin C'] },
    { code: 'I10', name: 'Tăng huyết áp vô căn', weight: 7, meds: ['Vitamin C'], lab: 'Xét nghiệm mỡ máu' },
    { code: 'K29.7', name: 'Viêm dạ dày', weight: 6, meds: ['Omeprazol', 'Smecta'] },
    { code: 'E78.5', name: 'Rối loạn lipid máu', weight: 4, meds: ['Vitamin C'], lab: 'Xét nghiệm mỡ máu' },
    { code: 'K76.0', name: 'Gan nhiễm mỡ', weight: 3, meds: ['Vitamin C'], lab: 'Siêu âm ổ bụng' },
    { code: 'A09', name: 'Tiêu chảy nhiễm khuẩn', weight: 3, meds: ['Oresol', 'Berberin', 'Smecta'] },
    { code: 'J18.9', name: 'Viêm phổi', weight: 2, meds: ['Augmentin', 'Paracetamol', 'Acetylcystein'], lab: 'X-quang ngực thẳng' },
  ],
  'Nhi khoa': [
    { code: 'J00', name: 'Viêm mũi họng cấp', weight: 9, meds: ['Hapacol 250', 'Natri clorid 0,9%'] },
    { code: 'J20.9', name: 'Viêm phế quản cấp', weight: 5, meds: ['Hapacol 250', 'Acetylcystein', 'Amoxicillin'], lab: 'X-quang ngực thẳng' },
    { code: 'A09', name: 'Tiêu chảy nhiễm khuẩn', weight: 5, meds: ['Oresol', 'Smecta'] },
    { code: 'B34.9', name: 'Nhiễm virus', weight: 4, meds: ['Hapacol 250', 'Vitamin C'], lab: 'Công thức máu' },
    { code: 'L50.9', name: 'Mày đay', weight: 2, meds: ['Cetirizin'] },
  ],
  'Tai Mũi Họng': [
    { code: 'J02.9', name: 'Viêm họng cấp', weight: 9, meds: ['Paracetamol', 'Amoxicillin'] },
    { code: 'J01.9', name: 'Viêm xoang cấp', weight: 5, meds: ['Augmentin', 'Otrivin', 'Natri clorid 0,9%'], lab: 'Nội soi tai mũi họng' },
    { code: 'J30.4', name: 'Viêm mũi dị ứng', weight: 5, meds: ['Loratadin', 'Natri clorid 0,9%'] },
    { code: 'H66.9', name: 'Viêm tai giữa', weight: 3, meds: ['Amoxicillin', 'Paracetamol'], lab: 'Nội soi tai mũi họng' },
  ],
  'Da liễu': [
    { code: 'L70.0', name: 'Mụn trứng cá', weight: 8, meds: ['Fucidin'] },
    { code: 'L20.9', name: 'Viêm da cơ địa', weight: 5, meds: ['Cetirizin', 'Fucidin'] },
    { code: 'L50.9', name: 'Mày đay', weight: 4, meds: ['Loratadin'] },
    { code: 'B35.4', name: 'Nấm da thân', weight: 3, meds: ['Cetirizin'] },
  ],
  'Răng Hàm Mặt': [
    { code: 'K02.9', name: 'Sâu răng', weight: 8, meds: ['Paracetamol', 'Clorhexidin súc miệng'] },
    { code: 'K05.1', name: 'Viêm lợi mạn', weight: 5, meds: ['Clorhexidin súc miệng', 'Metronidazol'] },
    { code: 'K03.6', name: 'Cao răng', weight: 5, meds: ['Clorhexidin súc miệng'] },
  ],
};

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE_M = ['Văn', 'Đức', 'Minh', 'Quang', 'Hữu', 'Tiến', 'Thanh'];
const MIDDLE_F = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Minh', 'Phương', 'Hồng'];
const GIVEN_M = ['Hùng', 'Dũng', 'Nam', 'Long', 'Khánh', 'Tuấn', 'Phong', 'Huy', 'Sơn', 'Quân', 'Bảo', 'Đạt', 'Hải', 'Thắng'];
const GIVEN_F = ['Lan', 'Hương', 'Mai', 'Linh', 'Trang', 'Hà', 'Ngân', 'Thảo', 'Yến', 'Vy', 'Anh', 'Hằng', 'Nhung', 'Quỳnh'];

async function reset() {
  const patients = await prisma.patient.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, select: { id: true } });
  const patientIds = patients.map((p) => p.id);
  if (!patientIds.length) return console.log('Không có dữ liệu mẫu để xóa.');
  const visits = await prisma.visit.findMany({ where: { patientId: { in: patientIds } }, select: { id: true } });
  const visitIds = visits.map((v) => v.id);
  const appts = await prisma.appointment.findMany({ where: { patientId: { in: patientIds } }, select: { scheduleId: true } });
  await prisma.$transaction([
    prisma.prescription.deleteMany({ where: { visitId: { in: visitIds } } }),
    prisma.medicalRecord.deleteMany({ where: { visitId: { in: visitIds } } }),
    prisma.labOrder.deleteMany({ where: { visitId: { in: visitIds } } }),
    prisma.visit.deleteMany({ where: { id: { in: visitIds } } }),
    prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.schedule.deleteMany({ where: { id: { in: appts.map((a) => a.scheduleId) } } }),
    prisma.patient.deleteMany({ where: { id: { in: patientIds } } }),
  ]);
  console.log(`Đã xóa ${patientIds.length} bệnh nhân mẫu, ${visitIds.length} lượt khám mẫu.`);
}

async function generate(totalDays: number) {
  if (await prisma.patient.count({ where: { phone: { startsWith: PHONE_PREFIX } } })) {
    console.log('Đã có dữ liệu lịch sử mẫu. Chạy với --reset để xóa rồi tạo lại.');
    return;
  }
  const doctors = await prisma.doctor.findMany({ select: { id: true, specialty: { select: { name: true } } } });
  const medicines = await prisma.medicine.findMany({ select: { id: true, name: true, unit: true } });
  if (!doctors.length || !medicines.length) throw new Error('Chưa có bác sĩ hoặc danh mục thuốc: chạy `npx prisma db seed` trước.');
  const medId = new Map(medicines.map((m) => [m.name, m.id]));
  const medUnit = new Map(medicines.map((m) => [m.name, m.unit]));

  // Bệnh nhân mẫu: 70% người lớn, 30% trẻ em (cho khoa Nhi)
  const patients: Prisma.PatientCreateManyInput[] = [];
  for (let i = 0; i < 260; i++) {
    const male = rand() < 0.48;
    const child = i % 10 < 3;
    const year = child ? int(2012, 2024) : int(1950, 2005);
    patients.push({
      id: randomUUID(),
      fullName: `${pick(FAMILY)} ${pick(male ? MIDDLE_M : MIDDLE_F)} ${pick(male ? GIVEN_M : GIVEN_F)}`,
      gender: male ? 'MALE' : 'FEMALE',
      dateOfBirth: new Date(`${year}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`),
      phone: `${PHONE_PREFIX}${String(i).padStart(6, '0')}`,
      address: pick(['Cầu Giấy, Hà Nội', 'Đống Đa, Hà Nội', 'Thanh Xuân, Hà Nội', 'Hà Đông, Hà Nội', 'Nam Từ Liêm, Hà Nội', 'Hoàng Mai, Hà Nội']),
    });
  }
  await prisma.patient.createMany({ data: patients });
  const adults = patients.filter((_, i) => i % 10 >= 3);
  const children = patients.filter((_, i) => i % 10 < 3);
  // Một nhóm bệnh nhân quay lại nhiều lần (bệnh mạn tính), phần còn lại khám lẻ
  const regulars = adults.slice(0, 40);

  const today = Date.parse(new Date(Date.now() + VN).toISOString().slice(0, 10));
  const busyDays = new Set(
    (await prisma.visit.findMany({ where: { date: { gte: new Date(today - totalDays * DAY) } }, select: { date: true }, distinct: ['date'] })).map((v) =>
      v.date.toISOString().slice(0, 10),
    ),
  );

  // Khung giờ đã có lịch thật thì không dùng (mỗi bác sĩ một khung giờ chỉ có một lịch)
  const taken = new Set(
    (await prisma.schedule.findMany({ where: { startTime: { gte: new Date(today - totalDays * DAY) } }, select: { doctorId: true, startTime: true } })).map(
      (s) => `${s.doctorId}@${s.startTime.getTime()}`,
    ),
  );

  const visits: Prisma.VisitCreateManyInput[] = [];
  const records: Prisma.MedicalRecordCreateManyInput[] = [];
  const prescriptions: Prisma.PrescriptionCreateManyInput[] = [];
  const items: Prisma.PrescriptionItemCreateManyInput[] = [];
  const labOrders: Prisma.LabOrderCreateManyInput[] = [];
  const schedules: Prisma.ScheduleCreateManyInput[] = [];
  const appointments: Prisma.AppointmentCreateManyInput[] = [];

  for (let d = totalDays; d >= 1; d--) {
    const ymd = new Date(today - d * DAY).toISOString().slice(0, 10);
    const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || busyDays.has(ymd)) continue;
    // Thứ Hai đông nhất, thứ Bảy vắng; tỷ lệ đặt online tăng dần theo thời gian
    const dayLoad = [0, 1.25, 1.05, 1, 1, 0.95, 0.7][weekday];
    const progress = 1 - d / totalDays;
    const onlineShare = 0.22 + 0.26 * progress;

    for (const doc of doctors) {
      const specialty = doc.specialty.name;
      const dxList = DIAGNOSES[specialty] ?? DIAGNOSES['Nội tổng quát'];
      const n = Math.round(between(7, 13) * dayLoad);
      const slots = [...Array.from({ length: 16 }, (_, i) => 450 + i * 15), ...Array.from({ length: 12 }, (_, i) => 810 + i * 15)]
        .filter((m) => !taken.has(`${doc.id}@${at(ymd, m).getTime()}`))
        .sort(() => rand() - 0.5);
      const queue = { ONLINE: 0, WALK_IN: 0 };

      for (let k = 0; k < n; k++) {
        const online = rand() < onlineShare && slots.length > 0;
        const patient = specialty === 'Nhi khoa' ? pick(children) : rand() < 0.3 ? pick(regulars) : pick(adults);
        const visitId = randomUUID();
        let createdAt: Date;
        let calledAt: Date | null;
        let appointmentAt: Date | null = null;
        let appointmentId: string | null = null;

        if (online) {
          const slot = slots.pop()!;
          appointmentAt = at(ymd, slot);
          const scheduleId = randomUUID();
          appointmentId = randomUUID();
          schedules.push({ id: scheduleId, doctorId: doc.id, date: new Date(ymd), startTime: appointmentAt, endTime: at(ymd, slot + 15), isBooked: true });
          appointments.push({
            id: appointmentId,
            patientId: patient.id as string,
            scheduleId,
            status: 'COMPLETED',
            createdAt: new Date(appointmentAt.getTime() - between(0.3, 6) * DAY),
          });
          createdAt = new Date(appointmentAt.getTime() - between(3, 28) * MINUTE);
          calledAt = new Date(Math.max(createdAt.getTime(), appointmentAt.getTime()) + skewed(0, 4, 25) * MINUTE);
        } else {
          // Vãng lai: đông đầu giờ sáng và đầu giờ chiều
          const minute = weighted<[number, number]>([
            [[420, 480], 3],
            [[480, 600], 5],
            [[600, 690], 2],
            [[780, 870], 3],
            [[870, 990], 2],
          ]);
          createdAt = at(ymd, between(minute[0], minute[1]));
          const crowd = minute[0] < 600 || (minute[0] >= 780 && minute[0] < 870) ? 1.4 : 0.8;
          calledAt = rand() < 0.04 ? null : new Date(createdAt.getTime() + skewed(4, 18 * crowd, 95) * MINUTE);
        }

        const source = online ? 'ONLINE' : 'WALK_IN';
        const queueNumber = ++queue[source];
        if (!calledAt) {
          visits.push({
            id: visitId,
            patientId: patient.id as string,
            doctorId: doc.id,
            date: new Date(ymd),
            queueNumber,
            source,
            checkinMethod: 'RECEPTION',
            status: 'LEFT',
            createdAt,
          });
          continue;
        }

        const dx = weighted(dxList.map((x) => [x, x.weight] as [Dx, number]));
        const longExam = specialty === 'Răng Hàm Mặt';
        const exam = skewed(longExam ? 10 : 4, longExam ? 20 : 9, longExam ? 45 : 30);
        let completedAt = new Date(calledAt.getTime() + exam * MINUTE);
        let resultMode: 'RETURN' | 'ONLINE' | null = null;
        let sentForTestsAt: Date | null = null;
        let resultsReadyAt: Date | null = null;
        if (dx.lab && rand() < 0.45) {
          resultMode = rand() < 0.6 ? 'RETURN' : 'ONLINE';
          sentForTestsAt = new Date(calledAt.getTime() + between(5, 10) * MINUTE);
          const ready = new Date(sentForTestsAt.getTime() + skewed(20, 45, 150) * MINUTE);
          if (resultMode === 'RETURN') {
            resultsReadyAt = ready;
            completedAt = new Date(ready.getTime() + between(10, 35) * MINUTE);
          } else {
            completedAt = new Date(ready.getTime() + between(30, 240) * MINUTE);
          }
          labOrders.push({ id: randomUUID(), visitId, name: dx.lab, resultText: 'Kết quả trong giới hạn theo dõi', doneAt: ready, createdAt: sentForTestsAt });
        }

        visits.push({
          id: visitId,
          patientId: patient.id as string,
          doctorId: doc.id,
          date: new Date(ymd),
          queueNumber,
          source,
          checkinMethod: online ? 'QR' : 'RECEPTION',
          status: 'DONE',
          appointmentId,
          appointmentAt,
          calledAt,
          callRule: online ? 'APPOINTMENT' : 'ARRIVAL',
          resultMode,
          sentForTestsAt,
          resultsReadyAt,
          completedAt,
          createdAt,
        });
        records.push({ id: randomUUID(), visitId, symptoms: `Khám ${dx.name.toLowerCase()}`, diagnosis: dx.name, icdCode: dx.code, createdAt: calledAt });
        const meds = dx.meds.filter((m) => medId.has(m));
        if (meds.length && rand() < 0.9) {
          const prescriptionId = randomUUID();
          prescriptions.push({ id: prescriptionId, visitId, doctorId: doc.id, status: 'FINALIZED', finalizedAt: completedAt, createdAt: completedAt });
          for (const m of meds) {
            const days = int(3, 7);
            // Chai, tuýp: một đơn thường chỉ một chai; viên, gói: theo số ngày
            const quantity = ['chai', 'tuýp'].includes(medUnit.get(m) ?? '') ? 1 : days * 2;
            items.push({ id: randomUUID(), prescriptionId, medicineId: medId.get(m)!, quantity, dosePerTime: '1', timesPerDay: 2, days });
          }
        }
      }

      // Lịch hẹn không đến và lịch bị hủy (không có lượt khám)
      for (const status of ['NO_SHOW', 'CANCELLED'] as const) {
        const count = Math.round(n * onlineShare * (status === 'NO_SHOW' ? between(0, 0.22) : between(0, 0.14)));
        for (let k = 0; k < count && slots.length; k++) {
          const slot = slots.pop()!;
          const scheduleId = randomUUID();
          const startTime = at(ymd, slot);
          schedules.push({ id: scheduleId, doctorId: doc.id, date: new Date(ymd), startTime, endTime: at(ymd, slot + 15), isBooked: status === 'NO_SHOW' });
          appointments.push({
            id: randomUUID(),
            patientId: pick(adults).id as string,
            scheduleId,
            status,
            createdAt: new Date(startTime.getTime() - between(0.5, 5) * DAY),
          });
        }
      }
    }
  }

  // Ghi theo lô để nhanh
  const chunk = async <T>(rows: T[], write: (batch: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await write(rows.slice(i, i + 1000));
  };
  await chunk(schedules, (data) => prisma.schedule.createMany({ data }));
  await chunk(appointments, (data) => prisma.appointment.createMany({ data }));
  await chunk(visits, (data) => prisma.visit.createMany({ data }));
  await chunk(records, (data) => prisma.medicalRecord.createMany({ data }));
  await chunk(labOrders, (data) => prisma.labOrder.createMany({ data }));
  await chunk(prescriptions, (data) => prisma.prescription.createMany({ data }));
  await chunk(items, (data) => prisma.prescriptionItem.createMany({ data }));
  console.log(`Đã tạo dữ liệu mẫu ${totalDays} ngày: ${patients.length} bệnh nhân, ${visits.length} lượt khám, ${appointments.length} lịch hẹn.`);
}

const args = process.argv.slice(2);
const daysArg = args.indexOf('--days');
const run = args.includes('--reset') ? reset() : generate(daysArg >= 0 ? Math.max(7, Math.min(366, Number(args[daysArg + 1]) || 60)) : 60);
run
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
