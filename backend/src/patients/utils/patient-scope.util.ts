import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Tìm hồ sơ bệnh nhân gắn với tài khoản đang đăng nhập. */
export async function patientIdOf(prisma: PrismaService, user: AuthUser) {
  const patient = await prisma.patient.findUnique({ where: { userId: user.sub } });
  if (!patient) throw new ForbiddenException('Tài khoản chưa có hồ sơ bệnh nhân');
  return patient.id;
}

/**
 * Hồ sơ của tài khoản bệnh nhân đang đăng nhập, kèm mốc ẩn dữ liệu cũ (null = thấy hết).
 * Dùng `visibleSince(scope.lockedBefore)` trong điều kiện truy vấn lượt khám / lịch hẹn của bệnh nhân.
 */
export async function patientScopeOf(prisma: PrismaService, user: AuthUser) {
  const p = await prisma.patient.findUnique({ where: { userId: user.sub }, select: { id: true, historyLockedBefore: true } });
  if (!p) throw new ForbiddenException('Tài khoản chưa có hồ sơ bệnh nhân');
  return { patientId: p.id, lockedBefore: p.historyLockedBefore };
}

/** Điều kiện chỉ lấy bản ghi tạo từ lúc tài khoản gắn vào hồ sơ (khi hồ sơ chưa xác minh) */
export const visibleSince = (lockedBefore: Date | null) => (lockedBefore ? { createdAt: { gte: lockedBefore } } : {});

/** Thông tin cá nhân lễ tân đã nhập, bị che khi hồ sơ chưa xác minh */
export const PRIVATE_FIELDS = [
  'nationalId',
  'address',
  'insuranceNo',
  'insuranceExpiry',
  'allergies',
  'occupation',
  'ethnicity',
  'relativeName',
  'relativePhone',
] as const;

/**
 * Hồ sơ trả cho chính bệnh nhân: bỏ mã liên kết và các cột nội bộ; hồ sơ có sẵn chưa xác minh thì che thông tin
 * cá nhân lễ tân đã nhập. Không có mã liên kết ở đây là điều kiện để kẻ chiếm số không tự xác minh được.
 */
export function selfPatientView<
  P extends { historyLockedBefore: Date | null; linkCode?: string | null; verifyFailures?: number; verifyLockedUntil?: Date | null },
>(p: P) {
  const { historyLockedBefore, linkCode: _code, verifyFailures: _f, verifyLockedUntil: _l, ...rest } = p;
  if (!historyLockedBefore) return { ...rest, verified: true };
  return { ...rest, ...Object.fromEntries(PRIVATE_FIELDS.map((f) => [f, null])), verified: false };
}
