/** Quy tắc mật khẩu mới, giống backend (backend/src/auth/password.ts) và web, để báo lỗi ngay khi gõ. */
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

/** Lý do đầu tiên chưa đạt (để hiện thành một dòng lỗi), null nếu đạt hết */
export function passwordProblem(password: string, phone?: string): string | null {
  const failed = passwordChecks(password, phone).findIndex((c) => !c.ok);
  return ['Mật khẩu tối thiểu 8 ký tự', 'Mật khẩu cần có cả chữ và số', 'Mật khẩu không được chứa số điện thoại'][failed] ?? null;
}
