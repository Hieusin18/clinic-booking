/**
 * Dữ liệu mẫu cho phát triển và demo. Chạy: npx prisma db seed
 * Chạy lại nhiều lần không bị trùng (upsert theo SĐT / tên).
 * Mọi tài khoản mẫu dùng mật khẩu 123456.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const specialties = [
  { name: 'Nội tổng quát', description: 'Khám và điều trị các bệnh nội khoa thường gặp' },
  { name: 'Nhi khoa', description: 'Khám sức khỏe và bệnh lý cho trẻ dưới 16 tuổi' },
  { name: 'Tai Mũi Họng', description: 'Viêm họng, viêm xoang, viêm tai' },
  { name: 'Da liễu', description: 'Mụn, viêm da, dị ứng da' },
  { name: 'Răng Hàm Mặt', description: 'Khám răng, nhổ răng, lấy cao răng' },
];

type Step = { fromYear: number; toYear: number | null; title: string; place: string };
type SeedDoctor = {
  fullName: string;
  phone: string;
  title: string;
  specialty: string;
  bio: string;
  practiceSince: number;
  expertise: string[];
  education: Step[];
  career: Step[];
};

// Hồ sơ mẫu (nhân vật hư cấu) để demo trang hồ sơ bác sĩ
const doctors: SeedDoctor[] = [
  {
    fullName: 'Nguyễn Văn An', phone: '0910000001', title: 'ThS.BS', specialty: 'Nội tổng quát',
    bio: 'Khám và điều trị các bệnh nội khoa thường gặp ở người lớn, theo dõi bệnh mạn tính lâu dài.',
    practiceSince: 2009, expertise: ['Tăng huyết áp', 'Rối loạn mỡ máu', 'Viêm dạ dày'],
    education: [
      { fromYear: 2013, toYear: 2015, title: 'Thạc sĩ Nội khoa', place: 'Đại học Y Hà Nội' },
      { fromYear: 2003, toYear: 2009, title: 'Bác sĩ đa khoa', place: 'Đại học Y Hà Nội' },
    ],
    career: [
      { fromYear: 2019, toYear: null, title: 'Bác sĩ Nội tổng quát', place: 'Phòng khám Đa khoa' },
      { fromYear: 2009, toYear: 2019, title: 'Bác sĩ điều trị, khoa Nội', place: 'Bệnh viện Đa khoa tỉnh Hà Nam' },
    ],
  },
  {
    fullName: 'Trần Thị Bình', phone: '0910000002', title: 'BSCKI', specialty: 'Nội tổng quát',
    bio: 'Hơn 10 năm khám bệnh nội khoa, chú trọng tư vấn chế độ ăn và theo dõi đường huyết.',
    practiceSince: 2012, expertise: ['Đái tháo đường', 'Tăng huyết áp', 'Bệnh tuyến giáp'],
    education: [
      { fromYear: 2016, toYear: 2018, title: 'Bác sĩ chuyên khoa I Nội khoa', place: 'Đại học Y Hà Nội' },
      { fromYear: 2006, toYear: 2012, title: 'Bác sĩ đa khoa', place: 'Học viện Quân y' },
    ],
    career: [
      { fromYear: 2021, toYear: null, title: 'Phụ trách chuyên môn khoa Nội', place: 'Phòng khám Đa khoa' },
      { fromYear: 2012, toYear: 2021, title: 'Bác sĩ điều trị, khoa Nội tiết', place: 'Bệnh viện Thanh Nhàn' },
    ],
  },
  {
    fullName: 'Lê Minh Châu', phone: '0910000003', title: 'BSCKII', specialty: 'Nhi khoa',
    bio: 'Khám và tư vấn cho trẻ dưới 16 tuổi: hô hấp, tiêu hóa, dinh dưỡng và tiêm chủng.',
    practiceSince: 2005, expertise: ['Viêm đường hô hấp ở trẻ', 'Tiêu chảy cấp', 'Tư vấn dinh dưỡng'],
    education: [
      { fromYear: 2012, toYear: 2014, title: 'Bác sĩ chuyên khoa II Nhi khoa', place: 'Đại học Y Hà Nội' },
      { fromYear: 1999, toYear: 2005, title: 'Bác sĩ đa khoa', place: 'Đại học Y Thái Bình' },
    ],
    career: [
      { fromYear: 2020, toYear: null, title: 'Trưởng chuyên khoa Nhi', place: 'Phòng khám Đa khoa' },
      { fromYear: 2010, toYear: 2020, title: 'Phó trưởng khoa Hô hấp', place: 'Bệnh viện Nhi Trung ương' },
      { fromYear: 2005, toYear: 2010, title: 'Bác sĩ điều trị', place: 'Bệnh viện Nhi Trung ương' },
    ],
  },
  {
    fullName: 'Phạm Thu Dung', phone: '0910000004', title: 'ThS.BS', specialty: 'Tai Mũi Họng',
    bio: 'Nội soi và điều trị bệnh tai mũi họng ở người lớn và trẻ em.',
    practiceSince: 2014, expertise: ['Viêm xoang', 'Viêm họng mạn', 'Nội soi tai mũi họng'],
    education: [
      { fromYear: 2017, toYear: 2019, title: 'Thạc sĩ Tai Mũi Họng', place: 'Đại học Y Hà Nội' },
      { fromYear: 2008, toYear: 2014, title: 'Bác sĩ đa khoa', place: 'Đại học Y Dược Thái Nguyên' },
    ],
    career: [
      { fromYear: 2022, toYear: null, title: 'Bác sĩ Tai Mũi Họng', place: 'Phòng khám Đa khoa' },
      { fromYear: 2014, toYear: 2022, title: 'Bác sĩ điều trị', place: 'Bệnh viện Tai Mũi Họng Trung ương' },
    ],
  },
  {
    fullName: 'Hoàng Quốc Em', phone: '0910000005', title: 'BS', specialty: 'Da liễu',
    bio: 'Khám và điều trị mụn, viêm da, dị ứng da.',
    practiceSince: 2019, expertise: ['Mụn trứng cá', 'Viêm da cơ địa'],
    education: [{ fromYear: 2013, toYear: 2019, title: 'Bác sĩ đa khoa', place: 'Đại học Y Hà Nội' }],
    career: [
      { fromYear: 2023, toYear: null, title: 'Bác sĩ Da liễu', place: 'Phòng khám Đa khoa' },
      { fromYear: 2019, toYear: 2023, title: 'Bác sĩ điều trị', place: 'Bệnh viện Da liễu Trung ương' },
    ],
  },
  {
    fullName: 'Võ Thanh Giang', phone: '0910000006', title: 'BSCKI', specialty: 'Răng Hàm Mặt',
    bio: 'Khám răng định kỳ, nhổ răng, lấy cao răng và điều trị tủy.',
    practiceSince: 2013, expertise: ['Điều trị tủy', 'Nhổ răng khôn', 'Lấy cao răng'],
    education: [
      { fromYear: 2017, toYear: 2019, title: 'Bác sĩ chuyên khoa I Răng Hàm Mặt', place: 'Đại học Y Hà Nội' },
      { fromYear: 2007, toYear: 2013, title: 'Bác sĩ Răng Hàm Mặt', place: 'Đại học Y Dược TP. Hồ Chí Minh' },
    ],
    career: [
      { fromYear: 2018, toYear: null, title: 'Bác sĩ Răng Hàm Mặt', place: 'Phòng khám Đa khoa' },
      { fromYear: 2013, toYear: 2018, title: 'Bác sĩ điều trị', place: 'Bệnh viện Răng Hàm Mặt Trung ương' },
    ],
  },
];

const medicines: { name: string; activeIngredient: string; strength: string; unit: string }[] = [
  { name: 'Paracetamol', activeIngredient: 'Paracetamol', strength: '500mg', unit: 'viên' },
  { name: 'Hapacol 250', activeIngredient: 'Paracetamol', strength: '250mg', unit: 'gói' },
  { name: 'Ibuprofen', activeIngredient: 'Ibuprofen', strength: '400mg', unit: 'viên' },
  { name: 'Amoxicillin', activeIngredient: 'Amoxicillin', strength: '500mg', unit: 'viên' },
  { name: 'Augmentin', activeIngredient: 'Amoxicillin + Acid clavulanic', strength: '625mg', unit: 'viên' },
  { name: 'Cefuroxim', activeIngredient: 'Cefuroxim', strength: '500mg', unit: 'viên' },
  { name: 'Azithromycin', activeIngredient: 'Azithromycin', strength: '250mg', unit: 'viên' },
  { name: 'Loratadin', activeIngredient: 'Loratadin', strength: '10mg', unit: 'viên' },
  { name: 'Cetirizin', activeIngredient: 'Cetirizin', strength: '10mg', unit: 'viên' },
  { name: 'Omeprazol', activeIngredient: 'Omeprazol', strength: '20mg', unit: 'viên' },
  { name: 'Smecta', activeIngredient: 'Diosmectit', strength: '3g', unit: 'gói' },
  { name: 'Oresol', activeIngredient: 'Natri clorid, Kali clorid, Glucose', strength: '4,1g', unit: 'gói' },
  { name: 'Vitamin C', activeIngredient: 'Acid ascorbic', strength: '500mg', unit: 'viên' },
  { name: 'Berberin', activeIngredient: 'Berberin', strength: '100mg', unit: 'viên' },
  { name: 'Acetylcystein', activeIngredient: 'Acetylcystein', strength: '200mg', unit: 'gói' },
  { name: 'Natri clorid 0,9%', activeIngredient: 'Natri clorid', strength: '10ml', unit: 'chai' },
  { name: 'Otrivin', activeIngredient: 'Xylometazolin', strength: '0,05%', unit: 'chai' },
  { name: 'Fucidin', activeIngredient: 'Acid fusidic', strength: '2%', unit: 'tuýp' },
  { name: 'Clorhexidin súc miệng', activeIngredient: 'Clorhexidin', strength: '0,12%', unit: 'chai' },
  { name: 'Metronidazol', activeIngredient: 'Metronidazol', strength: '250mg', unit: 'viên' },
];

async function upsertUser(data: { fullName: string; phone: string; role: 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR' | 'PATIENT' }, passwordHash: string) {
  return prisma.user.upsert({
    where: { phone: data.phone },
    update: {},
    create: { ...data, passwordHash },
  });
}

async function main() {
  const passwordHash = await hashPassword('123456');

  await upsertUser({ fullName: 'Quản trị viên', phone: '0900000001', role: 'ADMIN' }, passwordHash);
  await upsertUser({ fullName: 'Lễ tân Mai', phone: '0900000002', role: 'RECEPTIONIST' }, passwordHash);

  const patientUser = await upsertUser({ fullName: 'Đỗ Hữu Phúc', phone: '0900000003', role: 'PATIENT' }, passwordHash);
  await prisma.patient.upsert({
    where: { phone: '0900000003' },
    update: {},
    create: {
      userId: patientUser.id,
      fullName: 'Đỗ Hữu Phúc',
      phone: '0900000003',
      dateOfBirth: new Date('1995-04-12'),
      gender: 'MALE',
      address: 'Cầu Giấy, Hà Nội',
      allergies: 'Penicillin',
    },
  });

  for (const s of specialties) {
    await prisma.specialty.upsert({ where: { name: s.name }, update: {}, create: s });
  }

  for (const d of doctors) {
    const user = await upsertUser({ fullName: d.fullName, phone: d.phone, role: 'DOCTOR' }, passwordHash);
    const specialty = await prisma.specialty.findUniqueOrThrow({ where: { name: d.specialty } });
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, specialtyId: specialty.id, title: d.title },
    });
    // Chỉ điền hồ sơ mẫu khi bác sĩ chưa có quá trình công tác (không ghi đè dữ liệu đã sửa)
    if ((await prisma.doctorHistory.count({ where: { doctorId: doctor.id } })) === 0) {
      await prisma.doctor.update({
        where: { id: doctor.id },
        data: { bio: doctor.bio ?? d.bio, practiceSince: d.practiceSince, expertise: d.expertise.join('\n') },
      });
      await prisma.doctorHistory.createMany({
        data: [
          ...d.education.map((e) => ({ ...e, doctorId: doctor.id, kind: 'EDUCATION' as const })),
          ...d.career.map((e) => ({ ...e, doctorId: doctor.id, kind: 'WORK' as const })),
        ],
      });
    }
  }

  for (const m of medicines) {
    const exists = await prisma.medicine.findFirst({ where: { name: m.name, strength: m.strength } });
    if (!exists) await prisma.medicine.create({ data: m });
  }

  console.log('Đã tạo dữ liệu mẫu. Tài khoản (mật khẩu 123456):');
  console.log('  Admin 0900000001 · Lễ tân 0900000002 · Bệnh nhân 0900000003 · Bác sĩ 0910000001–0910000006');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
