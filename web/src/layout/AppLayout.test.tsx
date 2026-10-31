import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../lib/auth';
import type { User } from '../lib/types';
import { fakeUser, page, renderPage } from '../test/render';
import { AppLayout } from './AppLayout';

const routes = [
  page('/login', <p>Trang đăng nhập</p>),
  { element: <AppLayout />, children: [page('/admin/doctors', <p>Danh sách bác sĩ</p>)] },
];

/** AuthContext có trạng thái thật để bấm Đăng xuất làm user về null như ứng dụng thật. */
function WithAuth({ initial }: { initial: User }) {
  const [user, setUser] = useState<User | null>(initial);
  const [router] = useState(() => createMemoryRouter(routes, { initialEntries: ['/admin/doctors'] }));
  const auth = { user, loading: false, login: async () => initial, logout: () => setUser(null) };
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('AppLayout', () => {
  it('bấm Đăng xuất thì về trang đăng nhập, không bị trang trắng', async () => {
    render(<WithAuth initial={fakeUser('ADMIN')} />);
    expect(await screen.findByText('Danh sách bác sĩ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
  });
  it('chưa đăng nhập (token hết hạn) thì chuyển về trang đăng nhập', async () => {
    renderPage(routes, { path: '/admin/doctors' });
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
  });
  it('tài khoản bệnh nhân được hướng dẫn dùng app', async () => {
    renderPage(routes, { path: '/admin/doctors', user: fakeUser('PATIENT') });
    expect(await screen.findByText(/dùng ứng dụng trên điện thoại/)).toBeInTheDocument();
  });
});
