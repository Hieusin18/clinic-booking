import { describe, expect, it } from 'vitest';
import { firstPasswordProblem, passwordChecks } from './password';

describe('quy tắc mật khẩu (giống backend)', () => {
  it('báo điều kiện đầu tiên chưa đạt', () => {
    expect(firstPasswordProblem('123456')).toBe('Mật khẩu cần: tối thiểu 8 ký tự');
    expect(firstPasswordProblem('abcdefgh')).toBe('Mật khẩu cần: có cả chữ và số');
    expect(firstPasswordProblem('a0912345678', '0912345678')).toBe('Mật khẩu cần: không chứa số điện thoại');
    expect(firstPasswordProblem('khambenh24', '0912345678')).toBeNull();
  });
  it('danh sách dấu ✓ / ✗', () => {
    expect(passwordChecks('khambenh24').every((c) => c.ok)).toBe(true);
  });
});
