import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { ReceptionPage } from './ReceptionPage';

const appt = {
  id: 'a1',
  status: 'CONFIRMED',
  reason: null,
  createdAt: '',
  schedule: { id: 's', startTime: '2026-11-02T01:30:00.000Z', endTime: '', doctor: { id: 'd1', title: 'BS', user: { fullName: 'An' } } },
  patient: { id: 'p1', fullName: 'Lê Thị Hẹn', phone: '0901111111' },
  visit: null,
};
const visit = {
  id: 'v1',
  queueNumber: 7,
  createdAt: '2026-11-02T01:00:00.000Z',
  patient: { fullName: 'Lê Thị Hẹn' },
  doctor: { id: 'd1', title: 'BS', user: { fullName: 'An' }, specialty: { id: 's', name: 'Nhi khoa' } },
};

function mockGet(patients: unknown[] = []) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/appointments') return { data: [appt] };
    if (url === '/patients') return { data: { items: patients, total: patients.length, page: 1, pageSize: 10 } };
    if (url === '/doctors') return { data: { items: [], total: 0, page: 1, pageSize: 100 } };
    return { data: null };
  });
}

describe('Trang tiếp đón', () => {
  afterEach(() => vi.restoreAllMocks());

  it('không tìm thấy hồ sơ thì mở form tạo mới, điền sẵn SĐT vừa tìm', async () => {
    mockGet([]);
    renderPage([page('/', <ReceptionPage />)], { user: fakeUser('RECEPTIONIST') });
    await userEvent.type(screen.getByPlaceholderText(/Nhập SĐT/), '0987654321{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ mới' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Số điện thoại')).toHaveValue('0987654321');
  });

  it('check-in lịch hẹn hôm nay rồi hiện phiếu số', async () => {
    mockGet();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: visit });
    renderPage([page('/', <ReceptionPage />)], { user: fakeUser('RECEPTIONIST') });
    await userEvent.click(await screen.findByRole('button', { name: 'Check-in' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/queue/checkin', { appointmentId: 'a1' }));
    expect(await screen.findByText('Đã cấp số')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
