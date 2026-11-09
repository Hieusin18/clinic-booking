/**
 * Bệnh nhân gọi API thì các object "patient" lồng bên trong (phiếu khám, lịch hẹn…) không kèm thông tin cá nhân
 * lễ tân đã nhập (dị ứng, CCCD, địa chỉ…). App không cần chúng ở đó: bệnh nhân xem hồ sơ của mình qua
 * GET /patients/me, nơi đã che các mục này khi tài khoản chưa xác minh là chính chủ (xem patients/account-link.service.ts).
 * Đặt ở một chỗ để API mới thêm sau cũng không lỡ để lộ.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { PRIVATE_FIELDS } from '../../patients/utils/patient-scope.util.js';

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Bỏ các mục riêng tư khỏi mọi object nằm dưới khóa "patient" (trả bản sao, không sửa dữ liệu gốc) */
export function stripNestedPatientPrivate(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => stripNestedPatientPrivate(v, depth + 1));
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'patient' && isPlain(v)) {
      const p = stripNestedPatientPrivate(v, depth + 1) as Record<string, unknown>;
      for (const f of PRIVATE_FIELDS) delete p[f];
      out[k] = p;
    } else {
      out[k] = stripNestedPatientPrivate(v, depth + 1);
    }
  }
  return out;
}

@Injectable()
export class PatientPrivacyInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    if (ctx.getType() !== 'http') return next.handle();
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.role !== 'PATIENT') return next.handle();
    return next.handle().pipe(map((data: unknown) => stripNestedPatientPrivate(data)));
  }
}
