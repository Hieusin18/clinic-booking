/** Quy tắc mật khẩu mới, giống backend (backend/src/auth/password.ts) để báo lỗi ngay khi gõ. */
export const MIN_PASSWORD = 8;

export interface PasswordCheck {
  label: string;
  ok: boolean;
}

/** Danh sách điều kiện để hiện dấu ✓ / ✗ dưới ô mật khẩu mới */
export function passwordChecks(password: string, phone?: string): PasswordCheck[] {
  return [
    { label: `Tối thiểu ${MIN_PASSWORD} ký tự`, ok: password.length >= MIN_PASSWORD },
    { label: 'Có cả chữ và số', ok: /\p{L}/u.test(password) && /\d/.test(password) },
    { label: 'Không chứa số điện thoại', ok: !phone || !password.includes(phone) },
  ];
}
