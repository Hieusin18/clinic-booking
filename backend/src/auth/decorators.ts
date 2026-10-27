import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** API không cần đăng nhập (mặc định mọi API đều cần). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Chỉ các vai trò được liệt kê mới gọi được API. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Thông tin người đang đăng nhập, lấy từ JWT. */
export interface AuthUser {
  sub: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
