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

let onUnauthorized: ((reason: string) => void) | null = null;
/** AuthProvider đăng ký hàm này để tự đăng xuất khi token hết hạn, bị khóa hoặc đã đổi mật khẩu ở máy khác. */
export const setUnauthorizedHandler = (fn: ((reason: string) => void) | null) => (onUnauthorized = fn);

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) onUnauthorized?.(errorMessage(err));
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

/** Nội dung lỗi backend (mã lỗi như CHECKIN_TOO_EARLY và dữ liệu kèm theo) để màn hình xử lý riêng. */
export function errorData<T extends object = Record<string, unknown>>(err: unknown): (T & { code?: string }) | undefined {
  if (err instanceof AxiosError) return err.response?.data as (T & { code?: string }) | undefined;
  return undefined;
}

/**
 * Máy chủ đã trả lời và từ chối phiên (token hết hạn, bị khóa, tài khoản không còn…) thì mới đăng xuất.
 * Mất mạng hay máy chủ đang khởi động lại (vd. lúc Jenkins triển khai bản mới) thì giữ đăng nhập.
 */
export function sessionRejected(err: unknown) {
  return axios.isAxiosError(err) && !!err.response && err.response.status < 500;
}

const USER_KEY = 'clinic.user';

/** Thông tin tài khoản lần gần nhất lấy được, để mở lại trang lúc máy chủ chưa sẵn sàng vẫn vào được. */
export const userCache = {
  get<T>(): T | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(user: unknown) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};
