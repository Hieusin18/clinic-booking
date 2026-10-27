import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiToken, setUnauthorizedHandler } from './api';
import { AppError } from './errors';
import { tokenStorage } from './storage';
import type { Gender, User } from './types';

export interface RegisterInput {
  fullName: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  gender: Gender;
}

interface AuthState {
  user: User | null;
  /** true khi đang đọc token đã lưu lúc mở app */
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setApiToken(null);
    await tokenStorage.set(null);
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
      const res = await api.get<User>('/auth/me');
      if (res.data.role === 'PATIENT') setUser(res.data);
      else await logout();
    })()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const accept = useCallback(async (data: { accessToken: string; user: User }) => {
    if (data.user.role !== 'PATIENT') {
      throw new AppError('Ứng dụng dành cho bệnh nhân. Nhân viên vui lòng dùng trang web quản lý.');
    }
    setApiToken(data.accessToken);
    await tokenStorage.set(data.accessToken);
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

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
