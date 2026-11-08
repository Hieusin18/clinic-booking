/**
 * Đặt lại mật khẩu khi không còn admin nào đăng nhập được (vd. admin quên mật khẩu).
 * Chạy trên máy chủ, cần quyền truy cập CSDL:
 *
 *   docker compose exec backend npm run reset-password -- 0900000001
 *   # khi phát triển: npx tsx src/cli/reset-password.ts 0900000001
 *
 * In ra mật khẩu tạm; lần đăng nhập sau phải đổi mật khẩu. Mọi máy đang đăng nhập tài khoản đó bị đăng xuất.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { issueTemporaryPassword } from '../auth/accounts.js';
import { PrismaClient } from '../generated/prisma/client.js';

async function main() {
  const phone = process.argv[2];
  if (!phone || !/^0\d{9}$/.test(phone)) {
    console.error('Cách dùng: npm run reset-password -- <số điện thoại 10 số>');
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (!user) {
      console.error(`Không có tài khoản nào với số ${phone}`);
      process.exitCode = 1;
      return;
    }
    const r = await issueTemporaryPassword(prisma, user.id);
    console.log(`Đã đặt lại mật khẩu cho ${r.user.fullName} (${r.user.role}).`);
    console.log(`Mật khẩu tạm: ${r.temporaryPassword}`);
    console.log('Lần đăng nhập sau sẽ phải đổi mật khẩu. Các máy đang đăng nhập tài khoản này đã bị đăng xuất.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
