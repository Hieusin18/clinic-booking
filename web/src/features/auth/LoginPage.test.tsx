import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, page, renderPage } from '../../test/render';
import { LoginPage } from './LoginPage';

const routes = [page('/login', <LoginPage />), page('/admin/specialties', <p>Trang admin</p>), page('/doctor/queue', <p>Trang bác sĩ</p>)];

describe('Trang đăng nhập', () => {
  it('kiểm tra định dạng SĐT trước khi gửi', async () => {
    const login = vi.fn();
    renderPage(routes, { path: '/login', login });
    await userEvent.type(screen.getByLabelText('Số điện thoại'), '123');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('đăng nhập đúng thì chuyển tới trang của vai trò', async () => {
    const login = vi.fn().mockResolvedValue(fakeUser('DOCTOR'));
    renderPage(routes, { path: '/login', login });
    await userEvent.type(screen.getByLabelText('Số điện thoại'), '0910000001');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Trang bác sĩ')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('0910000001', '123456');
  });

  it('hiện thông báo lỗi tiếng Việt từ backend', async () => {
    const err = new AxiosError('x', 'ERR', undefined, undefined, {
      data: { message: 'Sai số điện thoại hoặc mật khẩu' },
      status: 401,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    renderPage(routes, { path: '/login', login: vi.fn().mockRejectedValue(err) });
    await userEvent.type(screen.getByLabelText('Số điện thoại'), '0900000001');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'sai');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByText('Sai số điện thoại hoặc mật khẩu')).toBeInTheDocument());
  });
});
