import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AuthContext } from '../lib/auth';
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
  { path = '/', user = null as User | null, login = async () => fakeUser('ADMIN') } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const auth = { user, loading: false, login, logout: () => {} };
  const ui = (
    <AntApp>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </QueryClientProvider>
    </AntApp>
  );
  return { ...render(ui), router };
}

export const page = (path: string, element: ReactNode): RouteObject => ({ path, element });
