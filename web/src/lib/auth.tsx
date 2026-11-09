import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, sessionRejected, setUnauthorizedHandler, tokenStore, userCache } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  /** true khi đang kiểm tra token cũ lúc mở trang */
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  logout: () => void;
  /** Sau khi đổi mật khẩu: lưu token mới (các máy khác đã bị đăng xuất) */
  updateSession: (accessToken: string, user: User) => void;
  /** Lý do bị đăng xuất tự động (hiện ở trang đăng nhập), vd. tài khoản bị khóa */
  notice: string | null;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);
  const [notice, setNotice] = useState<string | null>(null);

  const logout = useCallback(() => {
    tokenStore.set(null);
    userCache.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      if (tokenStore.get()) setNotice(reason);
      logout();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  // Mở lại trang: dùng token đã lưu để lấy thông tin tài khoản
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get<User>('/auth/me')
      .then((res) => {
        setUser(res.data);
        userCache.set(res.data);
      })
      .catch((err) => {
        if (sessionRejected(err)) {
          tokenStore.set(null);
          userCache.set(null);
          return;
        }
        // Mất mạng / máy chủ đang khởi động lại: vào bằng thông tin đã lưu, các trang tự tải lại khi có mạng
        const cached = userCache.get<User>();
        if (cached) setUser(cached);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: User }>('/auth/login', { phone, password });
    tokenStore.set(res.data.accessToken);
    userCache.set(res.data.user);
    setNotice(null);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const updateSession = useCallback((accessToken: string, next: User) => {
    tokenStore.set(accessToken);
    userCache.set(next);
    setUser(next);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, updateSession, notice }), [user, loading, login, logout, updateSession, notice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

/** Trang chủ của từng vai trò sau khi đăng nhập. */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: '/admin/stats',
  DOCTOR: '/doctor/queue',
  RECEPTIONIST: '/reception',
  PATIENT: '/patient-only',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  DOCTOR: 'Bác sĩ',
  RECEPTIONIST: 'Lễ tân',
  PATIENT: 'Bệnh nhân',
};
