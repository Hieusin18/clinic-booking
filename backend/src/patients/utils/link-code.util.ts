import { NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';

/** Bỏ các ký tự dễ nhầm (0/O, 1/I/L) vì bệnh nhân gõ lại từ giấy */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 6;
type Db = Pick<PrismaClient, 'patient'>;

export const newLinkCode = () => Array.from({ length: LINK_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Chuẩn hóa mã bệnh nhân gõ: bỏ khoảng trắng / gạch, viết hoa */
export const normalizeCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();

/** Mã liên kết của hồ sơ (tạo nếu chưa có). Chỉ trả cho nhân viên và bản in của bác sĩ, không trả qua API của bệnh nhân. */
export async function ensureLinkCode(db: Db, patientId: string): Promise<string> {
  const p = await db.patient.findUnique({ where: { id: patientId }, select: { linkCode: true } });
  if (!p) throw new NotFoundException('Không tìm thấy bệnh nhân');
  if (p.linkCode) return p.linkCode;
  for (let attempt = 0; ; attempt++) {
    const code = newLinkCode();
    try {
      // Chỉ ghi nếu vẫn chưa có (hai yêu cầu cùng lúc không tạo hai mã)
      const r = await db.patient.updateMany({ where: { id: patientId, linkCode: null }, data: { linkCode: code } });
      if (r.count === 1) return code;
      return (await db.patient.findUniqueOrThrow({ where: { id: patientId }, select: { linkCode: true } })).linkCode!;
    } catch (e) {
      // Trùng mã với hồ sơ khác (rất hiếm): thử mã khác
      if (attempt >= 5) throw e;
    }
  }
}
