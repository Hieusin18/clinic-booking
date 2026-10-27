import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token cho mã QR động ở quầy.
 * Dạng: base64url(payload) + "." + base64url(HMAC-SHA256(payload))
 * payload = { c: clinicId, t: thời điểm tạo (giây) }
 * Không lưu CSDL: backend chỉ kiểm tra chữ ký và tuổi của token.
 */
export interface QrPayload {
  c: string;
  t: number;
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(data: string, secret: string): string {
  return b64(createHmac('sha256', secret).update(data).digest());
}

export function createQrToken(clinicId: string, secret: string, now = Date.now()): string {
  const payload: QrPayload = { c: clinicId, t: Math.floor(now / 1000) };
  const data = b64(JSON.stringify(payload));
  return `${data}.${sign(data, secret)}`;
}

export type QrCheck =
  | { ok: true; payload: QrPayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-clinic' };

export function verifyQrToken(
  token: string,
  opts: { secret: string; clinicId: string; ttlSeconds: number; now?: number },
): QrCheck {
  const [data, sig] = token.split('.');
  if (!data || !sig) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(sign(data, opts.secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let payload: QrPayload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (nowSec - payload.t > opts.ttlSeconds || payload.t > nowSec + 5) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.c !== opts.clinicId) return { ok: false, reason: 'wrong-clinic' };
  return { ok: true, payload };
}
