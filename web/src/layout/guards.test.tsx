import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('bệnh nhân được hướng dẫn dùng app', async () => {
    renderPage(routes, { path: '/admin/specialties', user: fakeUser('PATIENT') });
    expect(await screen.findByText(/dùng ứng dụng trên điện thoại/)).toBeInTheDocument();
  });
});
