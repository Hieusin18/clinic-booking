import { describe, expect, it } from 'vitest';
import { passwordChecks, passwordProblem } from './password';

describe('quy tắc mật khẩu', () => {
  it('đánh dấu từng điều kiện', () => {
    expect(passwordChecks('abc', '0900000003').map((c) => c.ok)).toEqual([false, false, true]);
    expect(passwordChecks('hoaxuan2026', '0900000003').map((c) => c.ok)).toEqual([true, true, true]);
    expect(passwordChecks('a0900000003', '0900000003').map((c) => c.ok)).toEqual([true, true, false]);
  });
  it('lý do đầu tiên chưa đạt (giống thông báo của máy chủ)', () => {
    expect(passwordProblem('abc')).toBe('Mật khẩu tối thiểu 8 ký tự');
    expect(passwordProblem('abcdefgh')).toBe('Mật khẩu cần có cả chữ và số');
    expect(passwordProblem('a0900000003', '0900000003')).toBe('Mật khẩu không được chứa số điện thoại');
    expect(passwordProblem('hoaxuan2026', '0900000003')).toBeNull();
  });
});
