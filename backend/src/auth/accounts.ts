/**
 * Admin đặt lại mật khẩu cho nhân viên quên mật khẩu: hệ thống tạo mật khẩu tạm (chỉ hiện một lần cho admin
 * đưa tận tay), người dùng phải đổi ở lần đăng nhập đầu; mọi máy đang đăng nhập bằng tài khoản đó bị đăng xuất.
 * Admin quên mật khẩu thì chạy lệnh trên máy chủ: `npm run reset-password -- <số điện thoại>` (src/cli).
 */
import { BadRequestException, Controller, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, CurrentUser, Roles } from './decorators.js';
import { hashPassword, temporaryPassword } from './password.js';
import { SessionsService } from './sessions.js';

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

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Tạo mật khẩu tạm cho bác sĩ / lễ tân (chỉ trả về một lần) */
  @Roles('ADMIN')
  @Post(':id/reset-password')
  @HttpCode(200)
  reset(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.resetPassword(admin, id);
  }
}

@Module({ controllers: [AccountsController], providers: [AccountsService] })
export class AccountsModule {}
