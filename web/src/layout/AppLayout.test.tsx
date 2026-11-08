import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
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
  const auth = { user, loading: false, login: async () => initial, logout: () => setUser(null), updateSession: () => {}, notice: null };
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

/** Mở lại trang (F5): lúc đầu đang kiểm tra token đã lưu (loading), sau đó mới có user */
function Reloading() {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });
  const [router] = useState(() => createMemoryRouter(routes, { initialEntries: ['/admin/doctors'] }));
  useEffect(() => {
    const t = setTimeout(() => setState({ user: fakeUser('ADMIN'), loading: false }), 30);
    return () => clearTimeout(t);
  }, []);
  const auth = { ...state, login: async () => fakeUser('ADMIN'), logout: () => {}, updateSession: () => {}, notice: null };
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('AppLayout', () => {
  afterEach(() => vi.restoreAllMocks());
  it('mở lại trang (F5) thì ở nguyên trang đang xem, không bị đẩy về trang đăng nhập', async () => {
    render(<Reloading />);
    expect(await screen.findByText('Danh sách bác sĩ')).toBeInTheDocument();
    expect(screen.queryByText('Trang đăng nhập')).not.toBeInTheDocument();
  });
  it('menu tài khoản có Đổi mật khẩu', async () => {
    render(<WithAuth initial={fakeUser('ADMIN', { fullName: 'Quản trị viên' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tài khoản Quản trị viên' }));
    expect(await screen.findByText('Đổi mật khẩu')).toBeInTheDocument();
  });
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
  it('bác sĩ có ảnh đại diện thì góc phải hiện ảnh thay cho chữ cái đầu', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { id: 'd9', avatarVersion: 3 } });
    const doctorRoutes = [{ element: <AppLayout />, children: [page('/doctor/queue', <p>Khám bệnh</p>)] }];
    renderPage(doctorRoutes, { path: '/doctor/queue', user: fakeUser('DOCTOR', { fullName: 'Trần Thị Bình' }) });
    const img = await screen.findByAltText('Ảnh Trần Thị Bình');
    expect(img.getAttribute('src')).toMatch(/\/doctors\/d9\/avatar\?v=3$/);
  });
  it('tài khoản không phải bác sĩ thì không gọi API hồ sơ bác sĩ', async () => {
    const get = vi.spyOn(api, 'get');
    render(<WithAuth initial={fakeUser('ADMIN')} />);
    expect(await screen.findByText('Danh sách bác sĩ')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/doctors/me');
  });
});
