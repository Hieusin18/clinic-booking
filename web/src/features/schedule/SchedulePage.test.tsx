import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { groupByDay, SchedulePage } from './SchedulePage';

const slot = (id: string, day: string, hhmm: string, patient?: string) => ({
  id,
  date: `${day}T00:00:00.000Z`,
  startTime: new Date(`${day}T${hhmm}:00+07:00`).toISOString(),
  endTime: new Date(`${day}T${hhmm}:00+07:00`).toISOString(),
  appointments: patient ? [{ id: 'a', status: 'CONFIRMED' as const, reason: 'Sốt', patient: { id: 'p', fullName: patient, phone: '09' } }] : [],
});

describe('Lịch làm việc của bác sĩ', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gom khung giờ theo ngày, sắp xếp theo ngày', () => {
    const days = groupByDay([slot('b', '2026-11-03', '08:00'), slot('a', '2026-11-02', '08:00'), slot('c', '2026-11-02', '08:15')]);
    expect(days.map(([d, l]) => [d, l.length])).toEqual([['2026-11-02', 2], ['2026-11-03', 1]]);
  });

  it('khung giờ đã đặt hiện tên bệnh nhân và không có nút xóa', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [slot('a', '2026-11-02', '08:00', 'Trần Văn Bệnh'), slot('b', '2026-11-02', '08:15')] });
    renderPage([page('/', <SchedulePage />)], { user: fakeUser('DOCTOR') });
    expect(await screen.findByText('08:00 · Trần Văn Bệnh')).toBeInTheDocument();
    expect(screen.getByText('· 1/2 lượt đã có người đặt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Xóa khung giờ 08:00')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Xóa khung giờ 08:15')).toBeInTheDocument();
  });

  it('mở khung giờ gửi ngày, giờ và độ dài lượt lên API', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { created: 12, skipped: 0 } });
    renderPage([page('/', <SchedulePage />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByRole('button', { name: 'Mở khung giờ' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/schedules/bulk', expect.objectContaining({ start: '08:00', end: '11:00', slotMinutes: 15 })));
    expect(await screen.findByText('Đã mở 12 khung giờ.')).toBeInTheDocument();
  });
});
