import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { todayYmd } from '../../lib/format';
import type { WorkSchedule } from '../../lib/types';
import { fakeUser, page, renderPage } from '../../test/render';
import { byDay, totalHours, weekDays } from './week';
import { WorkSchedulePage } from './WorkSchedulePage';

const today = todayYmd();
const at = (hhmm: string) => new Date(`${today}T${hhmm}:00+07:00`).toISOString();

const data: WorkSchedule = {
  from: today,
  to: today,
  doctors: [
    {
      id: 'd1',
      fullName: 'Nguyễn An',
      title: 'BS',
      room: 'P.101',
      specialty: { id: 's1', name: 'Nội khoa' },
      shifts: [{ date: today, startTime: at('08:00'), endTime: at('10:00'), slots: 4, booked: 1 }],
    },
  ],
  receptionists: [
    { id: 'r1', fullName: 'Trần Lễ Tân', phone: '0901234567', shifts: [{ id: 'sh1', userId: 'r1', date: today, startTime: at('13:00'), endTime: at('17:00'), note: 'Quầy 1' }] },
  ],
};

describe('Lịch làm việc (admin)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tiện ích theo tuần', () => {
    const days = weekDays(dayjs('2026-11-16'));
    expect(days.map((d) => d.format('DD/MM'))).toEqual(['16/11', '17/11', '18/11', '19/11', '20/11', '21/11', '22/11']);
    expect(byDay([{ date: '2026-11-16T00:00:00.000Z' }, { date: '2026-11-16' }, { date: '2026-11-17' }]).get('2026-11-16')).toHaveLength(2);
    expect(totalHours([{ startTime: at('07:00'), endTime: at('12:00') }, { startTime: at('13:00'), endTime: at('15:30') }])).toBe('7,5 giờ');
  });

  it('xem ca khám bác sĩ, ca trực lễ tân và xếp thêm ca', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <WorkSchedulePage />)], { user: fakeUser('ADMIN') });

    expect(await screen.findByText('BS Nguyễn An')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/work-schedule', expect.objectContaining({ params: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }) }));
    expect(screen.getByText(/08:00–10:00/)).toBeInTheDocument();
    expect(screen.getByText('1/4 lượt đặt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Lễ tân/ }));
    expect(await screen.findByText('Trần Lễ Tân')).toBeInTheDocument();
    expect(screen.getByText('13:00–17:00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Xếp ca cho Trần Lễ Tân ngày ${dayjs(today).format('DD/MM')}`) }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Sáng 07:00–12:00/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xếp ca' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/shifts', { userId: 'r1', date: today, start: '07:00', end: '12:00', note: undefined }));
    // Bảng 7 cột + hộp thoại có DatePicker/TimePicker: máy CI chậm có lúc quá 15 giây
  }, 40_000);
});
