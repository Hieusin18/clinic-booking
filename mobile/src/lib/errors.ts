import { AxiosError } from 'axios';

/** Lấy thông báo lỗi tiếng Việt từ backend (NestJS trả message là chuỗi hoặc mảng). */
export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join('\n');
    if (msg) return msg;
    if (!err.response) return 'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ API.';
  }
  return 'Đã có lỗi xảy ra, vui lòng thử lại';
}
