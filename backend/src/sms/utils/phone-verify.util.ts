import { createHash, timingSafeEqual } from 'node:crypto';
import { SMS_PREFIX } from '../phone-verify.constants.js';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** "+84 912 345 678", "84912345678", "0912-345-678" → "0912345678"; không phải số di động VN → null */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  const local = digits.replace(/^\+?84/, '0');
  return /^0\d{9}$/.test(local) ? local : null;
}

/** Lấy mã 6 số trong tin nhắn ("PKXM 482913", "pkxm482913", hoặc chỉ "482913") */
export function codeIn(body: string): string | null {
  return /(?:^|\D)(\d{6})(?:\D|$)/.exec(body.replace(new RegExp(SMS_PREFIX, 'i'), ' '))?.[1] ?? null;
}

/** Bật / tắt yêu cầu xác minh số khi đăng ký (mặc định bật; tắt bằng REQUIRE_PHONE_VERIFICATION=false) */
export const phoneVerificationRequired = () => process.env.REQUIRE_PHONE_VERIFICATION !== 'false';

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
