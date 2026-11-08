import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { SmsPage } from './SmsPage';

const data: Record<string, unknown> = {
  '/sms/config': { smsTo: null, simulator: true, iphoneShortcut: true, androidGateway: false, prefix: 'PKXM' },
  '/sms/pending': [{ id: 'v1', phone: '0912345678', purpose: 'REGISTER', code: '482913', expiresAt: '2026-11-08T10:10:00.000Z' }],
  '/sms/inbound': [
    {
      id: 'm1',
      source: 'IOS_SHORTCUT',
      fromRaw: '+84909999999',
      phone: '0909999999',
      body: 'PKXM 482913',
      result: 'WRONG_SENDER',
      receivedAt: '2026-11-08T10:01:00.000Z',
    },
  ],
};

describe('Tin nhắn xác minh (admin)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện cấu hình, phiên đang chờ và tin đã nhận; bấm giả lập thì gửi đúng số và nội dung', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: data[url] }));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true, result: 'VERIFIED' } });
    renderPage([page('/', <SmsPage />)], { user: fakeUser('ADMIN') });

    expect(await screen.findByText('chưa cấu hình')).toBeInTheDocument();
    expect(screen.getAllByText('iPhone Phím tắt').length).toBeGreaterThan(0);
    expect(await screen.findByText('482913')).toBeInTheDocument();
    expect(screen.getByText('Sai số người gửi')).toBeInTheDocument();
    const row = screen.getByText('482913').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /Giả lập tin nhắn/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/sms/simulate', { from: '0912345678', body: 'PKXM 482913' }));
  });
});
