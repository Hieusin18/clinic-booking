import { describe, expect, it } from 'vitest';
import { mmss, secondsLeft, smsUrl, spacedCode } from './sms';

describe('nhắn tin xác minh', () => {
  it('mở màn soạn tin đúng cú pháp từng hệ điều hành', () => {
    expect(smsUrl('0988000999', 'PKXM 482913', 'ios')).toBe('sms:0988000999&body=PKXM%20482913');
    expect(smsUrl('0988000999', 'PKXM 482913', 'android')).toBe('sms:0988000999?body=PKXM%20482913');
  });
  it('hiển thị mã và thời gian còn lại', () => {
    expect(spacedCode('482913')).toBe('482 913');
    expect(secondsLeft('2026-11-08T10:10:00Z', Date.parse('2026-11-08T10:00:55Z'))).toBe(545);
    expect(secondsLeft('2026-11-08T10:00:00Z', Date.parse('2026-11-08T10:05:00Z'))).toBe(0);
    expect(mmss(545)).toBe('9:05');
  });
});
