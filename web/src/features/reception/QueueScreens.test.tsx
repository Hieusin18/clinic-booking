import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { CounterPage } from './CounterPage';
import { QueueBoardPage } from './QueueBoardPage';

const doctor = { id: 'd1', title: 'BS', user: { fullName: 'An' }, specialty: { id: 's', name: 'Nhi khoa' } };
const v = (id: string, queueNumber: number, source: 'ONLINE' | 'WALK_IN', status: string, predictedOrder: number | null = null) => ({
  id,
  queueNumber,
  source,
  status,
  predictedOrder,
  checkinMethod: 'QR',
  createdAt: '2026-11-02T01:00:00.000Z',
  appointmentAt: source === 'ONLINE' ? '2026-11-02T01:30:00.000Z' : null,
  patient: { fullName: `Bệnh nhân ${id}` },
  doctor,
});
const queue = [v('1', 1, 'ONLINE', 'IN_PROGRESS'), v('2', 2, 'ONLINE', 'WAITING', 0), v('3', 1, 'WALK_IN', 'WAITING', 1), v('4', 2, 'WALK_IN', 'DONE')];

function mockGet() {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/queue/today') return { data: queue };
    if (url === '/qr/current') return { data: { token: 'tok', refreshAfterSeconds: 30 } };
    if (url === '/doctors') return { data: { items: [], total: 0, page: 1, pageSize: 100 } };
    return { data: null };
  });
}

describe('Màn hình hàng đợi', () => {
  afterEach(() => vi.restoreAllMocks());

  it('màn hình quầy: số đang khám theo bác sĩ và các số sắp gọi theo thứ tự gọi', async () => {
    mockGet();
    renderPage([page('/counter', <CounterPage />)], { path: '/counter', user: fakeUser('RECEPTIONIST') });
    expect(await screen.findByText('A01')).toBeInTheDocument();
    expect(screen.getByText('BS An')).toBeInTheDocument();
    expect(await screen.findByText('SẮP GỌI')).toBeInTheDocument();
    const next = screen.getAllByText(/^[AB]0\d$/).map((e) => e.textContent);
    // A01 đang khám, rồi A02 (gọi tiếp theo) trước B01; B02 đã khám không hiện
    expect(next).toEqual(['A01', 'A02', 'B01']);
  });

  it('bảng hàng đợi: đếm theo trạng thái', async () => {
    mockGet();
    renderPage([page('/q', <QueueBoardPage />)], { path: '/q', user: fakeUser('RECEPTIONIST') });
    expect(await screen.findByText('A02')).toBeInTheDocument();
    const stat = (label: string) => screen.getByText(label, { selector: 'div' }).parentElement!;
    expect(within(stat('Đang chờ')).getByText('2')).toBeInTheDocument();
    expect(within(stat('Đang khám')).getByText('1')).toBeInTheDocument();
    expect(within(stat('Bỏ về')).getByText('0')).toBeInTheDocument();
  });
});
