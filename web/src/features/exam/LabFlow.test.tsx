import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { ExamPage } from './ExamPage';
import { labFileProblem } from './labFiles';

const patient = { id: 'p1', fullName: 'Trần Văn Phổi', phone: '0903333333', dateOfBirth: '1970-01-01T00:00:00.000Z', gender: 'MALE', allergies: null };
const doctor = { id: 'd1', title: 'BS', user: { fullName: 'An' } };
const record = { id: 'r1', symptoms: 'Ho', diagnosis: 'Viêm phổi?', icdCode: null, followUpDate: null };
const visit = (status: string, extra = {}) => ({
  id: 'v1',
  date: '2026-11-02T00:00:00.000Z',
  queueNumber: 4,
  source: 'WALK_IN',
  checkinMethod: 'RECEPTION',
  status,
  reason: 'Ho',
  appointmentId: null,
  createdAt: '2026-11-02T01:00:00.000Z',
  patient,
  doctor,
  ...extra,
});
const order = (extra = {}) => ({ id: 'o1', name: 'X-quang ngực thẳng', note: null, resultText: null, doneAt: null, createdAt: '2026-11-02T01:10:00.000Z', files: [], ...extra });
const detail = (status: string, extra = {}) => ({ ...visit(status), medicalRecord: record, prescriptions: [], prescription: null, labOrders: [order()], ...extra });

function mockApi(queue: unknown[], d: unknown, awaiting: unknown[] = []) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/queue/doctor') return { data: queue };
    if (url === '/lab/awaiting-visits') return { data: awaiting };
    if (url === '/visits/v1') return { data: d };
    return { data: [] };
  });
}

describe('Cận lâm sàng trên màn hình khám', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chỉ nhận ảnh JPG, PNG hoặc PDF tối đa 10 MB', () => {
    expect(labFileProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(labFileProblem({ type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(labFileProblem({ type: 'image/gif', size: 10 })).toMatch(/JPG, PNG/);
  });

  it('thêm chỉ định rồi gửi đi cận lâm sàng, chọn nhận kết quả online', async () => {
    mockApi([visit('IN_PROGRESS')], detail('IN_PROGRESS'));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });

    await userEvent.type(await screen.findByRole('combobox', { name: 'Tên chỉ định cận lâm sàng' }), 'Siêu âm ổ bụng');
    await userEvent.click(screen.getByRole('button', { name: /Thêm/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/visits/v1/lab-orders', { name: 'Siêu âm ổ bụng' }));

    // Còn chỉ định chưa có kết quả: chưa hoàn tất được, gửi đi được
    expect(screen.getByRole('button', { name: 'Hoàn tất lượt khám' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đi cận lâm sàng' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('X-quang ngực thẳng')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByText('Nhận kết quả online'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi đi' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/visits/v1/send-for-tests', { mode: 'ONLINE' }));
  });

  it('ghi kết quả rồi trả kết quả', async () => {
    mockApi([visit('IN_PROGRESS')], detail('IN_PROGRESS'));
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    const box = await screen.findByRole('textbox', { name: 'Kết quả X-quang ngực thẳng' });
    expect(screen.getByRole('button', { name: /Trả kết quả/ })).toBeDisabled();
    await userEvent.type(box, 'Đám mờ thùy dưới phổi phải');
    await userEvent.click(screen.getByRole('button', { name: /Trả kết quả/ }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/lab-orders/o1', { resultText: 'Đám mờ thùy dưới phổi phải', done: true }));
  });

  it('lượt đang chờ kết quả hiện ở thẻ riêng; chế độ quay lại: đủ kết quả thì đưa vào hàng chờ', async () => {
    const done = order({ resultText: 'Bình thường', doneAt: '2026-11-02T02:00:00.000Z', files: [{ id: 'f1', fileName: 'phim.png', mimeType: 'image/png', size: 2048, createdAt: '', url: '/lab-files/f1?exp=1&sig=x' }] });
    const awaitingVisit = visit('AWAITING_RESULTS', { resultMode: 'RETURN', sentForTestsAt: '2026-11-02T01:20:00.000Z', labOrders: [{ id: 'o1', name: 'X-quang ngực thẳng', doneAt: done.doneAt }] });
    mockApi([awaitingVisit], detail('AWAITING_RESULTS', { resultMode: 'RETURN', labOrders: [done] }), [awaitingVisit]);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });

    const card = (await screen.findByText('Đang làm cận lâm sàng')).closest('.ant-card') as HTMLElement;
    expect(within(card).getByText('Quay lại')).toBeInTheDocument();
    expect(within(card).getByText('Kết quả 1/1')).toBeInTheDocument();
    await userEvent.click(within(card).getByText('Trần Văn Phổi'));

    expect(await screen.findByAltText('phim.png')).toHaveAttribute('src', '/api/lab-files/f1?exp=1&sig=x');
    expect(screen.queryByRole('button', { name: 'Hoàn tất lượt khám' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đưa vào hàng chờ đọc kết quả' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/visits/v1/results-ready'));
  });

  it('chế độ online: đủ kết quả thì hoàn tất và gửi lên app', async () => {
    const done = order({ resultText: 'Gan nhiễm mỡ độ I', doneAt: '2026-11-02T02:00:00.000Z' });
    const awaitingVisit = visit('AWAITING_RESULTS', { resultMode: 'ONLINE', labOrders: [{ id: 'o1', name: 'X-quang ngực thẳng', doneAt: done.doneAt }] });
    mockApi([], detail('AWAITING_RESULTS', { resultMode: 'ONLINE', labOrders: [done] }), [awaitingVisit]);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByText('Trần Văn Phổi'));
    await userEvent.click(await screen.findByRole('button', { name: 'Hoàn tất và gửi lên app' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/visits/v1/complete'));
  });
});
