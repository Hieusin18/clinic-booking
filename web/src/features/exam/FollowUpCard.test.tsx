import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { Appointment } from '../../lib/types';
import { fakeUser, page, renderPage } from '../../test/render';
import { FollowUpCard } from './FollowUpCard';
import { followUpAfter } from './RecordCard';

describe('Hẹn tái khám', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chọn nhanh ngày tái khám tính từ ngày khám', () => {
    expect(followUpAfter('2026-11-20T00:00:00.000Z', { days: 7 }).format('YYYY-MM-DD')).toBe('2026-11-27');
    expect(followUpAfter('2026-11-30', { months: 1 }).format('YYYY-MM-DD')).toBe('2026-12-30');
  });

  it('chọn giờ trống để giữ chỗ tái khám', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [{ id: 's1', startTime: '2026-11-27T01:00:00.000Z', endTime: '2026-11-27T01:15:00.000Z' }] });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <FollowUpCard visitId="v1" doctorId="d1" followUpDate="2026-11-27" appointment={null} />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByRole('button', { name: '08:00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Đặt lịch' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/visits/v1/follow-up', { scheduleId: 's1' }));
    expect(get).toHaveBeenCalledWith('/doctors/d1/schedules', { params: { date: '2026-11-27' } });
  });

  it('đã đặt thì hiện giờ hẹn và cho hủy', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: {} });
    const appt = { id: 'a1', status: 'CONFIRMED', schedule: { id: 's1', startTime: '2026-11-27T01:00:00.000Z' } } as unknown as Appointment;
    renderPage([page('/', <FollowUpCard visitId="v1" doctorId="d1" followUpDate="2026-11-27" appointment={appt} />)], { user: fakeUser('DOCTOR') });
    expect(await screen.findByText('08:00 · 27/11/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy lịch' }));
    // Nút xác nhận trong hộp Popconfirm
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Hủy lịch' })).toHaveLength(2));
    await userEvent.click(screen.getAllByRole('button', { name: 'Hủy lịch' })[1]);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/visits/v1/follow-up'));
  });
});
