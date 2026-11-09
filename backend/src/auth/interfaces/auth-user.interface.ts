import type { Role } from '../../generated/prisma/enums.js';

/** Thông tin người đang đăng nhập, lấy từ JWT. */
export interface AuthUser {
  sub: string;
  role: Role;
  /** Phiên bản token (User.tokenVersion lúc cấp); token cũ hơn bị từ chối */
  ver?: number;
}
