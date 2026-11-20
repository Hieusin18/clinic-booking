import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { Visit } from '../../lib/types';
import { fakeUser, page, renderPage } from '../../test/render';
import { NursePage } from './NursePage';

const visit = (id: string, n: number, name: string, extra: Partial<Visit> = {}) =>
  ({
    id,
    date: '2026-11-20T00:00:00.000Z',
    queueNumber: n,
    source: 'WALK_IN',
    checkinMethod: 'RECEPTION',
    status: 'WAITING',
    reason: null,
    appointmentId: null,
    createdAt: '2026-11-20T01:00:00.000Z',
    labOrders: [],
    predictedOrder: n - 1,
    patient: { id: 'p' + id, fullName: name, phone: '0901111111', dateOfBirth: '1990-01-01T00:00:00.000Z', gender: 'MALE', allergies: n === 1 ? 'Penicillin' : null },
    doctor: { id: 'd1', title: 'BS', user: { fullName: 'Nguyễn An' }, room: 'P.101' },
    vitals: null,
    ...extra,
  }) as Visit;

describe('Điều dưỡng đo sinh hiệu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lọc người chưa đo, nhập sinh hiệu và cảnh báo bất thường', async () => {
    const done = visit('v2', 2, 'Trần Đã Đo', {
      vitals: { pulse: 80, temperature: 36.8, bpSystolic: 120, bpDiastolic: 80, respiratoryRate: null, spo2: 98, weight: 60, height: 165, note: null, measuredAt: '2026-11-20T01:10:00.000Z', measuredBy: { id: 'n', fullName: 'Điều dưỡng Lan' } },
    });
    vi.spyOn(api, 'get').mockImplementation(async (url: string) =>
      url === '/vitals/today' ? { data: [visit('v1', 1, 'Lê Chưa Đo'), done] } : { data: { items: [], total: 0, page: 1, pageSize: 100 } },
    );
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    renderPage([page('/', <NursePage />)], { user: fakeUser('NURSE') });

    expect(await screen.findByText('Lê Chưa Đo')).toBeInTheDocument();
    expect(screen.queryByText('Trần Đã Đo')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Đang chờ'));
    expect(await screen.findByText('Trần Đã Đo')).toBeInTheDocument();
    expect(screen.getByText(/M 80 · 36,8 °C · HA 120\/80/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Đo sinh hiệu B01' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Dị ứng: Penicillin')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Nhiệt độ'), '39');
    await userEvent.type(within(dialog).getByLabelText('SpO₂'), '91');
    expect(await within(dialog).findByText('Sốt cao')).toBeInTheDocument();
    expect(within(dialog).getByText('SpO₂ thấp')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu sinh hiệu' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/visits/v1/vitals', {
        note: null,
        pulse: null,
        temperature: 39,
        bpSystolic: null,
        bpDiastolic: null,
        respiratoryRate: null,
        spo2: 91,
        weight: null,
        height: null,
      }),
    );
  }, 40_000);
});
