import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Độ dài tối thiểu của mật khẩu người dùng tự đặt (mật khẩu tạm do admin cấp vẫn phải đổi ở lần đăng nhập đầu) */
export const MIN_PASSWORD = 8;

/** Mật khẩu quá phổ biến, kẻ dò mật khẩu luôn thử trước */
const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '88888888',
  '00000000',
  'password',
  'password1',
  'matkhau1',
  'matkhau123',
  'abc12345',
  'abcd1234',
  'qwerty123',
  'iloveyou1',
  'admin123',
  'admin1234',
]);

/**
 * Mật khẩu mới có đủ mạnh không: trả về lý do (tiếng Việt) nếu chưa đạt, null nếu được.
 * Quy tắc: tối thiểu 8 ký tự, có cả chữ và số, không phải mật khẩu phổ biến, không trùng số điện thoại.
 */
export function passwordProblem(password: string, phone?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự`;
  if (password.length > 72) return 'Mật khẩu tối đa 72 ký tự';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Mật khẩu cần có cả chữ và số';
  if (COMMON.has(password.toLowerCase())) return 'Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác';
  if (phone && password.includes(phone)) return 'Mật khẩu không được chứa số điện thoại';
  return null;
}

/** Mật khẩu tạm 10 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ và số: vd. "Kx7m-4Pq9a" */
export function temporaryPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  for (;;) {
    const chars = Array.from({ length: 9 }, () => all[randomInt(all.length)]);
    const pw = `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
    if (!passwordProblem(pw)) return pw;
  }
}
