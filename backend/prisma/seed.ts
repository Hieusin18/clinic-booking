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

const doctors = [
  { fullName: 'Nguyễn Văn An', phone: '0910000001', title: 'ThS.BS', specialty: 'Nội tổng quát' },
  { fullName: 'Trần Thị Bình', phone: '0910000002', title: 'BSCKI', specialty: 'Nội tổng quát' },
  { fullName: 'Lê Minh Châu', phone: '0910000003', title: 'BSCKII', specialty: 'Nhi khoa' },
  { fullName: 'Phạm Thu Dung', phone: '0910000004', title: 'ThS.BS', specialty: 'Tai Mũi Họng' },
  { fullName: 'Hoàng Quốc Em', phone: '0910000005', title: 'BS', specialty: 'Da liễu' },
  { fullName: 'Võ Thanh Giang', phone: '0910000006', title: 'BSCKI', specialty: 'Răng Hàm Mặt' },
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
    await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, specialtyId: specialty.id, title: d.title },
    });
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
