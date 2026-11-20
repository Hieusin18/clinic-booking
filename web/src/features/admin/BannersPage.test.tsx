import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { BannersPage } from './BannersPage';
import { parseLink, toPayload, type AdminBanner } from './bannerForm';

const notice: AdminBanner = {
  id: 'b1',
  kind: 'NOTICE',
  title: 'Nghỉ Tết từ 28/1',
  body: 'Mở cửa lại 4/2',
  link: null,
  imageVersion: null,
  startsAt: null,
  endsAt: null,
  sortOrder: 0,
  active: true,
  state: 'SHOWING',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

describe('Banner trên app', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chuyển link qua lại giữa form và API', () => {
    expect(parseLink('/doctor/d1')).toEqual({ linkType: 'doctor', doctorId: 'd1' });
    expect(parseLink('https://x.vn')).toEqual({ linkType: 'web', url: 'https://x.vn' });
    expect(parseLink(null)).toEqual({ linkType: 'none' });
    const start = dayjs('2026-12-01T00:00:00Z');
    expect(toPayload({ kind: 'PROMO', title: ' Gói khám ', linkType: 'book', doctorId: 'd2', range: [start, null], active: true })).toEqual({
      kind: 'PROMO',
      title: 'Gói khám',
      body: null,
      link: '/book/d2',
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: null,
      sortOrder: 0,
      active: true,
    });
  });

  it('thêm thông báo và tắt banner', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) =>
      url === '/admin/banners' ? { data: [notice] } : { data: { items: [], total: 0, page: 1, pageSize: 100 } },
    );
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    renderPage([page('/', <BannersPage />)], { user: fakeUser('ADMIN') });

    expect(await screen.findByText('Nghỉ Tết từ 28/1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Tắt Nghỉ Tết từ 28/1' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/banners/b1', expect.objectContaining({ title: 'Nghỉ Tết từ 28/1', active: false })));

    await userEvent.click(screen.getByRole('button', { name: /Thêm banner/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByPlaceholderText(/Nghỉ Tết từ 28\/1 đến hết/), 'Đổi giờ làm việc');
    expect(within(dialog).getAllByText('Đổi giờ làm việc').length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/admin/banners', expect.objectContaining({ kind: 'NOTICE', title: 'Đổi giờ làm việc', link: null, active: true })),
    );
  }, 40_000);
});
