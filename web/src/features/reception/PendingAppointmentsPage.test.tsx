import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { PendingAppointment } from '../../lib/types';
import { fakeUser, page, renderPage } from '../../test/render';
import { PendingAppointmentsPage, warnings } from './PendingAppointmentsPage';

const pending: PendingAppointment = {
  id: 'a1',
  status: 'PENDING',
  reason: 'Ho',
  createdAt: '2026-11-18T03:00:00.000Z',
  schedule: { id: 's', startTime: '2026-11-19T01:30:00.000Z', endTime: '', doctor: { id: 'd1', title: 'BS', user: { fullName: 'An' } } },
  patient: { id: 'p1', fullName: 'Trần Văn Đặt', phone: '0901111111' },
  patientInfo: { dateOfBirth: '1990-01-01T00:00:00.000Z', gender: 'MALE', accountCreatedAt: '2025-01-01T00:00:00.000Z', completed: 2, noShow: 0, cancelled: 0, rejected: 0, waiting: 1 },
};

describe('Duyệt lịch hẹn', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dấu hiệu đáng ngờ: nhiều lịch chờ, tài khoản mới, từng bỏ hẹn', () => {
    const now = new Date('2026-11-18T05:00:00.000Z').getTime();
    expect(warnings(pending, now)).toEqual([]);
    const spam = { ...pending, patientInfo: { ...pending.patientInfo, waiting: 5, accountCreatedAt: '2026-11-18T04:50:00.000Z', noShow: 2 } };
    expect(warnings(spam, now)).toEqual(['Đang chờ 5 lịch', 'Tài khoản mới tạo hôm nay', 'Từng không đến 2 lần']);
  });

  it('duyệt và từ chối kèm lý do', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [pending], total: 1 } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <PendingAppointmentsPage />)], { user: fakeUser('RECEPTIONIST') });
    expect(await screen.findByText('Trần Văn Đặt')).toBeInTheDocument();
    expect(screen.getByText(/Lý do: Ho/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Duyệt/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/appointments/a1/confirm'));

    await userEvent.click(screen.getByRole('button', { name: /Từ chối/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đặt nhiều lịch cùng lúc' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Từ chối lịch' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/appointments/a1/reject', { reason: 'Đặt nhiều lịch cùng lúc' }));
  });
});
