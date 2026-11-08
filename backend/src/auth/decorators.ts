import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** API không cần đăng nhập (mặc định mọi API đều cần). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';

/** API vẫn gọi được khi tài khoản đang dùng mật khẩu tạm (xem thông tin, đổi mật khẩu, đăng xuất). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

/** Chỉ các vai trò được liệt kê mới gọi được API. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Thông tin người đang đăng nhập, lấy từ JWT. */
export interface AuthUser {
  sub: string;
  role: Role;
  /** Phiên bản token (User.tokenVersion lúc cấp); token cũ hơn bị từ chối */
  ver?: number;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
