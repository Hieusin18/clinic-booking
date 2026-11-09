import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiToken, setUnauthorizedHandler } from './api';
import { AppError, sessionRejected } from './errors';
import { currentPushToken, takePushToken } from './pushToken';
import { tokenStorage, userCache } from './storage';
import type { Gender, User } from './types';

export interface RegisterInput {
  fullName: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  gender: Gender;
  /** Phiên xác minh số điện thoại bằng tin nhắn (components/PhoneVerify) */
  verificationId?: string;
  ticket?: string;
}

interface AuthState {
  user: User | null;
  /** true khi đang đọc token đã lưu lúc mở app */
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Đổi mật khẩu: máy này nhận token mới, các máy khác bị đăng xuất */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Đăng xuất khỏi mọi thiết bị (kể cả máy này) */
  logoutAll: () => Promise<void>;
  /** Quên mật khẩu: đặt mật khẩu mới sau khi nhắn tin xác minh số, rồi đăng nhập luôn */
  resetPassword: (verification: { verificationId: string; ticket: string }, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    // Báo server thôi đẩy thông báo của tài khoản này về máy (khi còn token đăng nhập)
    const push = takePushToken();
    if (push) await api.post('/notifications/push-token/remove', { token: push }).catch(() => undefined);
    setApiToken(null);
    await tokenStorage.set(null);
    await userCache.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  // Mở app: dùng token đã lưu để vào thẳng, không phải đăng nhập lại
  useEffect(() => {
    (async () => {
      const token = await tokenStorage.get();
      if (!token) return;
      setApiToken(token);
      try {
        const res = await api.get<User>('/auth/me');
        if (res.data.role !== 'PATIENT') return await logout();
        setUser(res.data);
        await userCache.set(res.data);
      } catch (err) {
        if (sessionRejected(err)) return await logout();
        // Mất mạng / máy chủ đang khởi động lại: vào bằng thông tin đã lưu, không bắt đăng nhập lại
        const cached = await userCache.get<User>();
        if (cached) setUser(cached);
      }
    })()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [logout]);

  const accept = useCallback(async (data: { accessToken: string; user: User }) => {
    if (data.user.role !== 'PATIENT') {
      throw new AppError('Ứng dụng dành cho bệnh nhân. Nhân viên vui lòng dùng trang web quản lý.');
    }
    setApiToken(data.accessToken);
    await tokenStorage.set(data.accessToken);
    await userCache.set(data.user);
    setUser(data.user);
  }, []);

  const login = useCallback(
    async (phone: string, password: string) => {
      const res = await api.post('/auth/login', { phone, password });
      await accept(res.data);
    },
    [accept],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await api.post('/auth/register', input);
      await accept(res.data);
    },
    [accept],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      // Gửi kèm token thông báo của máy này để vẫn nhận thông báo; các máy khác thì thôi
      const pushToken = currentPushToken() ?? undefined;
      const res = await api.post('/auth/change-password', { currentPassword, newPassword, pushToken });
      await accept(res.data);
    },
    [accept],
  );

  const logoutAll = useCallback(async () => {
    await api.post('/auth/logout-all');
    // Token đã hết hiệu lực: không gọi được API gỡ token thông báo nữa, chỉ xóa trên máy
    takePushToken();
    setApiToken(null);
    await tokenStorage.set(null);
    await userCache.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const resetPassword = useCallback(
    async (verification: { verificationId: string; ticket: string }, newPassword: string) => {
      const res = await api.post('/auth/reset-password', { ...verification, newPassword });
      await accept(res.data);
    },
    [accept],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, changePassword, logoutAll, resetPassword }),
    [user, loading, login, register, logout, changePassword, logoutAll, resetPassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
