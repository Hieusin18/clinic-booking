import type { FormRule } from 'antd';

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

/** Điều kiện đầu tiên chưa đạt (null = mật khẩu hợp lệ) */
export function firstPasswordProblem(password: string, phone?: string): string | null {
  const bad = passwordChecks(password, phone).find((c) => !c.ok);
  return bad ? `Mật khẩu cần: ${bad.label.toLowerCase()}` : null;
}

/** Luật cho ô "Mật khẩu ban đầu" khi admin tạo tài khoản (đọc số điện thoại ở ô "phone" cùng form) */
export const initialPasswordRules: FormRule[] = [
  { required: true, message: 'Nhập mật khẩu ban đầu' },
  ({ getFieldValue }) => ({
    validator: (_rule, value?: string) => {
      const problem = value ? firstPasswordProblem(value, getFieldValue('phone') as string | undefined) : null;
      return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
    },
  }),
];
