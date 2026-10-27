import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'clinic.token';

/** Đọc/ghi token; trình duyệt chặn localStorage (chế độ riêng tư) thì chỉ giữ trong bộ nhớ. */
let memoryToken: string | null = null;
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
    } catch {
      return memoryToken;
    }
  },
  set(token: string | null) {
    memoryToken = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

/** Client gọi backend. Dev: Vite proxy /api sang cổng 3000; production: Caddy phục vụ cùng tên miền. */
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized: (() => void) | null = null;
/** AuthProvider đăng ký hàm này để tự đăng xuất khi token hết hạn. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => (onUnauthorized = fn);

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) onUnauthorized?.();
    return Promise.reject(err);
  },
);

/** Lấy thông báo lỗi tiếng Việt từ backend (NestJS trả message là chuỗi hoặc mảng). */
export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join('; ');
    if (msg) return msg;
    if (!err.response) return 'Không kết nối được máy chủ, vui lòng thử lại';
  }
  return 'Đã có lỗi xảy ra, vui lòng thử lại';
}
