import { AxiosError } from 'axios';

/** Lấy thông báo lỗi tiếng Việt từ backend (NestJS trả message là chuỗi hoặc mảng). */
export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join('\n');
    if (msg) return msg;
    if (!err.response) return 'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ API.';
  }
  // Lỗi do app tự tạo (vd. tài khoản không phải bệnh nhân) đã có thông báo tiếng Việt
  if (err instanceof Error && err.name === 'AppError') return err.message;
  return 'Đã có lỗi xảy ra, vui lòng thử lại';
}

/** Lỗi có thông báo tiếng Việt sẵn để hiện cho người dùng. */
export class AppError extends Error {
  name = 'AppError';
}
