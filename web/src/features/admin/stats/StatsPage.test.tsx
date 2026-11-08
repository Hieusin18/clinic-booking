import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { fakeUser, page, renderPage } from '../../../test/render';
import { sample } from './sample';
import { StatsPage } from './StatsPage';

describe('Trang thống kê', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện chỉ số chính kèm so sánh với kỳ trước, các bảng xếp hạng và bảng theo bác sĩ', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: sample });
    renderPage([page('/', <StatsPage />)], { user: fakeUser('ADMIN') });
    expect(await screen.findByText('1.426')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/stats/overview', {
      params: { from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    });
    expect(screen.getByText('01/11/2026 – 07/11/2026 · so với 25/10/2026 – 31/10/2026', { exact: false })).toBeInTheDocument();
    // Lượt khám xong giảm 5,4%; chờ giảm 3,1 phút (tốt hơn)
    expect(screen.getByText('−5,4%', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('−3,1 phút', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Online 2,4 phút · Vãng lai 13,8 phút')).toBeInTheDocument();
    expect(screen.getByText(/chờ ít hơn 11,4 phút/)).toBeInTheDocument();
    expect(screen.getByText('Viêm họng, cấp')).toBeInTheDocument();
    expect(screen.getByText('362 đơn')).toBeInTheDocument();
    expect(screen.getByText('64 / 630 lịch đã tới giờ')).toBeInTheDocument();
    const row = screen.getByText('BSCKI Trần Thị Bình').closest('tr')!;
    expect(within(row).getByText('Phòng 2')).toBeInTheDocument();
    expect(within(row).getByText('7,9 phút')).toBeInTheDocument();
  });

  it('rê chuột vào cột để xem số liệu; chuyển sang dạng bảng', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sample });
    renderPage([page('/', <StatsPage />)], { user: fakeUser('ADMIN') });
    const chart = await screen.findByRole('img', { name: /Lượt lấy số theo ngày/ });
    // Vùng rê chuột của cột thứ nhất (06/11)
    fireEvent.mouseEnter(chart.querySelectorAll('rect[fill="transparent"]')[0]);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText(/06\/11\/2026/)).toBeInTheDocument();
    expect(within(tip).getByText('56')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Bảng'));
    const table = await screen.findByText('Khám xong');
    const rows = within(table.closest('table')!).getAllByRole('row');
    expect(
      within(rows[1])
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([expect.stringContaining('06/11/2026'), '28', '28', '56']);
  });

  it('tải CSV', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sample });
    const createUrl = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage([page('/', <StatsPage />)], { user: fakeUser('ADMIN') });
    await userEvent.click(await screen.findByRole('button', { name: /Tải CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
    vi.unstubAllGlobals();
  });
});
