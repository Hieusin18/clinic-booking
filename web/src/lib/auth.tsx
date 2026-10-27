import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  /** true khi đang kiểm tra token cũ lúc mở trang */
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  // Mở lại trang: dùng token đã lưu để lấy thông tin tài khoản
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: User }>('/auth/login', { phone, password });
    tokenStore.set(res.data.accessToken);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

/** Trang chủ của từng vai trò sau khi đăng nhập. */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: '/admin/specialties',
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
