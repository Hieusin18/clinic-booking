/**
 * Trùng dữ liệu (vi phạm ràng buộc @unique trong CSDL) thì trả 409 kèm câu dễ hiểu, thay vì lỗi 500.
 * Các chỗ đã tự kiểm tra trước (vd. số điện thoại khi đăng ký) vẫn giữ câu riêng; bộ lọc này bắt những trường
 * hợp còn lại (email trùng, CCCD trùng…) và cả khi hai yêu cầu cùng lúc vượt qua bước kiểm tra.
 */
import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';

const MESSAGES: Record<string, string> = {
  email: 'Email đã được dùng cho tài khoản khác',
  phone: 'Số điện thoại đã được dùng',
  nationalId: 'Số CCCD đã có trong hồ sơ khác',
  name: 'Tên đã tồn tại',
};

/** Tên cột bị trùng: Prisma để ở meta.target, còn qua driver adapter (pg) thì ở meta.driverAdapterError */
export function uniqueFields(e: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = e.meta as { target?: string[] | string; driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } } } | undefined;
  if (Array.isArray(meta?.target)) return meta.target;
  if (typeof meta?.target === 'string') return [meta.target];
  const c = meta?.driverAdapterError?.cause?.constraint;
  if (c?.fields?.length) return c.fields.map((f) => f.replace(/"/g, ''));
  // Tên chỉ mục mặc định của Prisma: "<Bảng>_<cột>_key"
  const m = c?.index?.match(/^[^_]+_(.+)_key$/);
  return m ? m[1].split('_') : [];
}

export function uniqueMessage(fields: string[]) {
  for (const f of fields) if (MESSAGES[f]) return MESSAGES[f];
  return 'Dữ liệu bị trùng với bản ghi đã có';
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class UniqueErrorFilter extends BaseExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (e.code === 'P2002') return super.catch(new ConflictException(uniqueMessage(uniqueFields(e))), host);
    return super.catch(e, host);
  }
}
