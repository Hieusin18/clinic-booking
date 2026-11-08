import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { Socket } from 'socket.io-client';
import { AuthContext } from '../lib/auth';
import { RealtimeContext } from '../lib/realtime';
import type { User } from '../lib/types';

export const fakeUser = (role: User['role'], extra: Partial<User> = {}): User => ({
  id: 'u1',
  fullName: 'Nguyễn Văn Test',
  phone: '0900000000',
  email: null,
  role,
  isActive: true,
  ...extra,
});

/** Render một trang với router ảo, React Query và người dùng giả (không cần backend). */
export function renderPage(
  routes: RouteObject[],
  {
    path = '/',
    user = null as User | null,
    login = async () => fakeUser('ADMIN'),
    logout = () => {},
    socket = null as FakeSocket | null,
    updateSession = (() => {}) as (token: string, user: User) => void,
    notice = null as string | null,
  } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const auth = { user, loading: false, login, logout, updateSession, notice };
  const ui = (
    <AntApp>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <RealtimeContext.Provider value={{ connected: !!socket, socket: socket as unknown as Socket | null }}>
            <RouterProvider router={router} />
          </RealtimeContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </AntApp>
  );
  return { ...render(ui), router };
}

export const page = (path: string, element: ReactNode): RouteObject => ({ path, element });

/** WebSocket giả: test gọi fire(...) như thể backend vừa phát sự kiện. */
export function fakeSocket() {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  return {
    on(event: string, fn: (p: unknown) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
      return this;
    },
    off(event: string, fn: (p: unknown) => void) {
      handlers.get(event)?.delete(fn);
      return this;
    },
    fire(event: string, payload: unknown) {
      handlers.get(event)?.forEach((fn) => fn(payload));
    },
  };
}
export type FakeSocket = ReturnType<typeof fakeSocket>;
