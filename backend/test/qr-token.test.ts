import { describe, expect, it } from 'vitest';
import { createQrToken, verifyQrToken } from '../src/qr/qr-token.js';

const opts = { secret: 'k', clinicId: 'c1', ttlSeconds: 60 };

describe('token QR', () => {
  it('chấp nhận token vừa tạo', () => {
    expect(verifyQrToken(createQrToken('c1', 'k'), opts).ok).toBe(true);
  });
  it('từ chối token quá 60 giây', () => {
    const old = createQrToken('c1', 'k', Date.now() - 61_000);
    expect(verifyQrToken(old, opts)).toEqual({ ok: false, reason: 'expired' });
  });
  it('từ chối token ký bằng khóa khác', () => {
    expect(verifyQrToken(createQrToken('c1', 'khac'), opts)).toEqual({ ok: false, reason: 'bad-signature' });
  });
  it('từ chối token của phòng khám khác', () => {
    expect(verifyQrToken(createQrToken('c2', 'k'), opts)).toEqual({ ok: false, reason: 'wrong-clinic' });
  });
  it('từ chối chuỗi sai định dạng', () => {
    expect(verifyQrToken('abc', opts)).toEqual({ ok: false, reason: 'malformed' });
  });
});
