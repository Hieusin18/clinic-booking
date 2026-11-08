import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALLOW_PENDING_PASSWORD, AuthUser, IS_PUBLIC, ROLES } from './decorators.js';

export const SESSION_EXPIRED = 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại';

/**
 * Kiểm tra token còn dùng được không: chữ ký và hạn của JWT, rồi tới tài khoản trong CSDL
 * (còn hoạt động, chưa đổi mật khẩu / đăng xuất mọi thiết bị sau khi cấp token).
 * Nhờ vậy khóa tài khoản hay đặt lại mật khẩu có hiệu lực ngay, không phải chờ token hết hạn.
 */
export async function verifySession(jwt: JwtService, prisma: PrismaService, token: string) {
  let payload: AuthUser;
  try {
    payload = await jwt.verifyAsync<AuthUser>(token);
  } catch {
    throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }
  const account = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { role: true, isActive: true, tokenVersion: true, mustChangePassword: true },
  });
  if (!account || (payload.ver ?? 0) !== account.tokenVersion) throw new UnauthorizedException(SESSION_EXPIRED);
  if (!account.isActive) throw new UnauthorizedException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
  return { user: { sub: payload.sub, role: account.role, ver: account.tokenVersion } as AuthUser, mustChangePassword: account.mustChangePassword };
}

/**
 * Guard toàn cục: mọi API đều cần JWT hợp lệ, trừ API gắn @Public().
 * Nếu API gắn @Roles(...), vai trò của tài khoản phải nằm trong danh sách.
 * Tài khoản đang dùng mật khẩu tạm chỉ gọi được các API gắn @AllowPendingPassword().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Bạn cần đăng nhập');

    const { user, mustChangePassword } = await verifySession(this.jwt, this.prisma, token);
    req.user = user;

    if (mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MUST_CHANGE_PASSWORD',
        message: 'Bạn đang dùng mật khẩu tạm, hãy đổi mật khẩu trước khi tiếp tục',
      });
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
