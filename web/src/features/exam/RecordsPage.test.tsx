import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { RecordsPage } from './RecordsPage';

const patient = { id: 'p1', fullName: 'Phạm Thị Mai', phone: '0905555555', dateOfBirth: '1980-05-05T00:00:00.000Z', gender: 'FEMALE', allergies: null };
const row = {
  id: 'v1',
  date: '2026-11-05T00:00:00.000Z',
  queueNumber: 3,
  source: 'ONLINE',
  checkinMethod: 'QR',
  status: 'DONE',
  reason: 'Đau đầu',
  appointmentId: null,
  createdAt: '2026-11-05T01:00:00.000Z',
  patient,
  doctor: { id: 'd1', title: 'BS', user: { fullName: 'An' } },
  labOrders: [{ id: 'o1', name: 'Điện tâm đồ', doneAt: '2026-11-05T02:00:00.000Z' }],
  medicalRecord: { diagnosis: 'Tăng huyết áp', icdCode: 'I10', followUpDate: '2026-11-20T00:00:00.000Z' },
  prescription: { id: 'rx', items: [{ id: 'i1' }, { id: 'i2' }] },
};
const detail = { ...row, medicalRecord: { id: 'r1', symptoms: 'Đau đầu', diagnosis: 'Tăng huyết áp', icdCode: 'I10' }, prescriptions: [], prescription: null, labOrders: [] };

function mockApi() {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/visits/examined') return { data: { items: [row], total: 1, page: 1, pageSize: 20 } };
    if (url === '/visits/v1') return { data: detail };
    return { data: [] };
  });
}

describe('Bệnh án đã khám', () => {
  afterEach(() => vi.restoreAllMocks());

  it('liệt kê lượt đã khám: ngày, bệnh nhân, chẩn đoán, cận lâm sàng, đơn, tái khám', async () => {
    mockApi();
    renderPage([page('/', <RecordsPage />)], { user: fakeUser('DOCTOR') });
    const r = (await screen.findByText('Phạm Thị Mai')).closest('tr') as HTMLElement;
    expect(within(r).getByText('05/11/2026')).toBeInTheDocument();
    expect(within(r).getByText('A03')).toBeInTheDocument();
    expect(within(r).getByText('Tăng huyết áp')).toBeInTheDocument();
    expect(within(r).getByText('I10')).toBeInTheDocument();
    expect(within(r).getByText('1 chỉ định')).toBeInTheDocument();
    expect(within(r).getByText('2 thuốc')).toBeInTheDocument();
    expect(within(r).getByText('20/11/2026')).toBeInTheDocument();
  });

  it('tìm kiếm gửi từ khóa và về trang 1', async () => {
    const get = mockApi();
    renderPage([page('/', <RecordsPage />)], { user: fakeUser('DOCTOR') });
    await screen.findByText('Phạm Thị Mai');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm bệnh án' }), 'tăng huyết áp{Enter}');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/visits/examined', { params: { page: 1, pageSize: 20, q: 'tăng huyết áp' } }));
  });

  it('bấm một dòng mở chi tiết lượt khám', async () => {
    const get = mockApi();
    renderPage([page('/', <RecordsPage />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByText('Phạm Thị Mai'));
    expect(await screen.findByText('Chi tiết lượt khám')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/visits/v1'));
  });
});
