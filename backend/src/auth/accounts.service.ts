/**
 * Admin đặt lại mật khẩu cho nhân viên quên mật khẩu: hệ thống tạo mật khẩu tạm (chỉ hiện một lần cho admin
 * đưa tận tay), người dùng phải đổi ở lần đăng nhập đầu; mọi máy đang đăng nhập bằng tài khoản đó bị đăng xuất.
 * Admin quên mật khẩu thì chạy lệnh trên máy chủ: `npm run reset-password -- <số điện thoại>` (src/cli).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser } from './interfaces/auth-user.interface.js';
import { SessionsService } from './sessions.service.js';
import { hashPassword, temporaryPassword } from './utils/password.util.js';

type Db = Pick<PrismaClient, 'user'>;

/** Đặt mật khẩu tạm cho một tài khoản (dùng chung cho API của admin và lệnh trên máy chủ). */
export async function issueTemporaryPassword(db: Db, userId: string) {
  const password = temporaryPassword();
  const user = await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      tokenVersion: { increment: 1 },
      failedLogins: 0,
      lockedUntil: null,
    },
    select: { id: true, fullName: true, phone: true, role: true },
  });
  return { user, temporaryPassword: password };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async resetPassword(admin: AuthUser, userId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new NotFoundException('Không tìm thấy tài khoản');
    if (userId === admin.sub) throw new BadRequestException('Hãy dùng chức năng Đổi mật khẩu cho tài khoản của bạn');
    if (target.role !== 'DOCTOR' && target.role !== 'RECEPTIONIST') throw new BadRequestException('Chỉ đặt lại được mật khẩu của bác sĩ và lễ tân');
    const result = await issueTemporaryPassword(this.prisma, userId);
    await this.sessions.revoke(userId);
    return result;
  }
}
