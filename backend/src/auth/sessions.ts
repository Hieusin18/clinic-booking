/**
 * Thu hồi phiên đăng nhập ở các máy khác. Token cũ đã hết hiệu lực nhờ tokenVersion (auth.guard.ts), nhưng máy cũ
 * vẫn còn hai thứ không đi qua bước kiểm tra token: thông báo đẩy (Expo gửi thẳng vào máy) và kết nối realtime
 * đang mở. Gọi revoke() sau mỗi lần đăng xuất mọi máy, đổi / đặt lại mật khẩu, khóa hoặc gỡ tài khoản.
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.js';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Ngắt mọi kết nối realtime dùng token cũ (máy đang dùng tự kết nối lại bằng token mới nếu vừa nhận).
   * @param keepPushToken token đẩy của máy đang dùng (khi đổi mật khẩu thì máy này vẫn đăng nhập)
   */
  async revoke(userId: string, opts: { keepPushToken?: string } = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, isActive: true } });
    await this.prisma.pushToken.deleteMany({
      where: { userId, ...(opts.keepPushToken ? { token: { not: opts.keepPushToken } } : {}) },
    });
    await this.realtime.disconnectUser(userId, user?.isActive ? user.tokenVersion : undefined);
  }
}

@Global()
@Module({ providers: [SessionsService], exports: [SessionsService] })
export class SessionsModule {}
