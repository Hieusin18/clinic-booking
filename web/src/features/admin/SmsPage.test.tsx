import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { SmsPage } from './SmsPage';

const inbound = [
  {
    id: 'm1',
    source: 'IOS_SHORTCUT',
    fromRaw: '+84909999999',
    phone: '0909999999',
    body: 'PKXM 482913',
    result: 'WRONG_SENDER',
    receivedAt: '2026-11-08T10:01:00.000Z',
  },
  {
    id: 'm2',
    source: 'IOS_SHORTCUT',
    fromRaw: '0912345678',
    phone: '0912345678',
    body: 'PKXM 482913',
    result: 'VERIFIED',
    receivedAt: '2026-11-08T10:02:00.000Z',
  },
];

describe('Tin nhắn xác minh (admin)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện cấu hình cổng và tin đã nhận kèm kết quả', async () => {
    const config = { smsTo: '0988000999', iphoneShortcut: true, androidGateway: false, prefix: 'PKXM' };
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/sms/config' ? config : inbound }));
    renderPage([page('/', <SmsPage />)], { user: fakeUser('ADMIN') });
    expect(await screen.findByText('0988000999')).toBeInTheDocument();
    expect(await screen.findByText('Sai số người gửi')).toBeInTheDocument();
    expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
    expect(screen.queryByText(/chưa cấu hình đủ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Giả lập/)).not.toBeInTheDocument();
  });

  it('cảnh báo khi chưa cấu hình số nhận tin hoặc nguồn nhận tin', async () => {
    const config = { smsTo: null, iphoneShortcut: false, androidGateway: false, prefix: 'PKXM' };
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/sms/config' ? config : [] }));
    renderPage([page('/', <SmsPage />)], { user: fakeUser('ADMIN') });
    expect(await screen.findByText(/chưa cấu hình đủ/)).toBeInTheDocument();
  });
});
