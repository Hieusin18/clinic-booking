import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { ChangePasswordPage } from './ChangePasswordPage';

const badRequest = (message: string) =>
  new AxiosError('400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    data: { message },
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

describe('Đổi mật khẩu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mật khẩu tạm: bắt đổi, kiểm tra độ mạnh khi gõ, đổi xong lưu token mới và về trang làm việc', async () => {
    const user = { ...fakeUser('DOCTOR'), phone: '0910000002', mustChangePassword: true };
    const fresh = { ...user, mustChangePassword: false };
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { accessToken: 'moi', user: fresh } });
    const updateSession = vi.fn();
    const { router } = renderPage([page('/account/password', <ChangePasswordPage />), page('/doctor/queue', <p>Khám bệnh</p>)], {
      path: '/account/password',
      user,
      updateSession,
    });
    expect(screen.getByText('Bạn đang dùng mật khẩu tạm')).toBeInTheDocument();
    expect(screen.queryByText('Đăng xuất mọi thiết bị')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Mật khẩu tạm'), 'Kx7m-4Pq9a');
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'abc');
    expect(screen.getByText('Tối thiểu 8 ký tự').querySelector('[aria-label="close-circle"]')).not.toBeNull();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'defgh2026');
    expect(screen.getByText('Có cả chữ và số').querySelector('[aria-label="check-circle"]')).not.toBeNull();
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'abcdefgh2025');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Nhập lại mật khẩu mới'));
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'abcdefgh2026');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'Kx7m-4Pq9a', newPassword: 'abcdefgh2026' }));
    expect(updateSession).toHaveBeenCalledWith('moi', fresh);
    await waitFor(() => expect(router.state.location.pathname).toBe('/doctor/queue'));
  });

  it('không cho mật khẩu chứa số điện thoại; hiện lỗi từ máy chủ', async () => {
    const user = { ...fakeUser('RECEPTIONIST'), phone: '0900000002' };
    vi.spyOn(api, 'post').mockRejectedValue(badRequest('Mật khẩu hiện tại không đúng'));
    renderPage([page('/', <ChangePasswordPage />)], { user });
    await userEvent.type(screen.getByLabelText('Mật khẩu hiện tại'), 'sai');
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'a0900000002');
    expect(screen.getByText('Không chứa số điện thoại').querySelector('[aria-label="close-circle"]')).not.toBeNull();
    await userEvent.clear(screen.getByLabelText('Mật khẩu mới'));
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'hoaxuan2026');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'hoaxuan2026');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument();
  });

  it('đăng xuất mọi thiết bị', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    const logout = vi.fn();
    renderPage([page('/', <ChangePasswordPage />)], { user: fakeUser('ADMIN'), logout });
    await userEvent.click(screen.getByRole('button', { name: /Đăng xuất mọi thiết bị/ }));
    const pop = await screen.findByRole('tooltip');
    await userEvent.click(within(pop).getByRole('button', { name: 'Đăng xuất hết' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/logout-all'));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });
});
