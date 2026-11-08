import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { ResetPasswordButton } from './ResetPasswordButton';

describe('Đặt lại mật khẩu nhân viên', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hỏi lại, rồi hiện mật khẩu tạm một lần', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { temporaryPassword: 'Kx7m-4Pq9a' } });
    renderPage([page('/', <ResetPasswordButton userId="u1" name="BS Bình" />)], { user: fakeUser('ADMIN') });
    await userEvent.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/ }));
    const pop = await screen.findByRole('tooltip');
    expect(within(pop).getByText(/các máy đang đăng nhập sẽ bị đăng xuất/)).toBeInTheDocument();
    await userEvent.click(within(pop).getByRole('button', { name: 'Đặt lại' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/users/u1/reset-password'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Mật khẩu tạm của BS Bình')).toBeInTheDocument();
    expect(within(dialog).getByText('Kx7m-4Pq9a')).toBeInTheDocument();
  });
});
