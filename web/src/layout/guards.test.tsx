import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { routes as appRoutes } from '../routes';
import { fakeUser, page, renderPage } from '../test/render';
import { RequireRole } from './guards';

const routes = [
  page('/login', <p>Trang đăng nhập</p>),
  page('/admin/specialties', <RequireRole roles={['ADMIN']}><p>Trang admin</p></RequireRole>),
  page('/reception', <p>Trang lễ tân</p>),
];

describe('RequireRole', () => {
  it('chưa đăng nhập thì chuyển về trang đăng nhập', async () => {
    renderPage(routes, { path: '/admin/specialties' });
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
  });
  it('đúng vai trò thì vào được', async () => {
    renderPage(routes, { path: '/admin/specialties', user: fakeUser('ADMIN') });
    expect(await screen.findByText('Trang admin')).toBeInTheDocument();
  });
  it('sai vai trò thì về trang của vai trò mình', async () => {
    renderPage(routes, { path: '/admin/specialties', user: fakeUser('RECEPTIONIST') });
    expect(await screen.findByText('Trang lễ tân')).toBeInTheDocument();
  });
  it('đang dùng mật khẩu tạm thì chỉ vào được trang đổi mật khẩu', async () => {
    const { router } = renderPage(appRoutes, { path: '/admin/doctors', user: { ...fakeUser('ADMIN'), mustChangePassword: true } });
    expect(await screen.findByText('Bạn đang dùng mật khẩu tạm')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account/password');
  });
  it('bệnh nhân được hướng dẫn dùng app', async () => {
    renderPage(routes, { path: '/admin/specialties', user: fakeUser('PATIENT') });
    expect(await screen.findByText(/dùng ứng dụng trên điện thoại/)).toBeInTheDocument();
  });
});

describe('Tài khoản bệnh nhân trên trang quản lý', () => {
  it('đăng nhập xong về /patient-only: hiện hướng dẫn, không lặp chuyển trang', async () => {
    const { router } = renderPage(appRoutes, { path: '/', user: fakeUser('PATIENT') });
    expect(await screen.findByText(/dùng ứng dụng trên điện thoại/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/patient-only');
  });
  it('bấm đăng xuất để đổi tài khoản', async () => {
    const logout = vi.fn();
    renderPage(appRoutes, { path: '/patient-only', user: fakeUser('PATIENT'), logout });
    await userEvent.click(await screen.findByRole('button', { name: /Đăng xuất/ }));
    expect(logout).toHaveBeenCalled();
  });
  it('nhân viên vào /patient-only thì về trang của mình; chưa đăng nhập thì về trang đăng nhập', async () => {
    const staff = renderPage(appRoutes, { path: '/patient-only', user: fakeUser('RECEPTIONIST') });
    await screen.findByText('Tiếp đón bệnh nhân');
    expect(staff.router.state.location.pathname).toBe('/reception');
    staff.unmount();
    const guest = renderPage(appRoutes, { path: '/patient-only' });
    await screen.findByRole('button', { name: /Đăng nhập/ });
    expect(guest.router.state.location.pathname).toBe('/login');
  });
});
