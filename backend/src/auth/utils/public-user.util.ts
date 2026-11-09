import type { User } from '../../generated/prisma/client.js';

/** Thông tin tài khoản trả về cho client (không bao giờ kèm passwordHash). */
export function publicUser(u: User) {
  return { id: u.id, fullName: u.fullName, phone: u.phone, email: u.email, role: u.role, isActive: u.isActive, mustChangePassword: u.mustChangePassword };
}
