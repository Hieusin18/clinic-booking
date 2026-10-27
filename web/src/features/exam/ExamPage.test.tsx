import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { ExamPage, suggestQuantity } from './ExamPage';

const patient = { id: 'p1', fullName: 'Vũ Thị Khám', phone: '0902222222', dateOfBirth: '1980-01-01T00:00:00.000Z', gender: 'FEMALE', allergies: 'Penicillin' };
const doctor = { id: 'd1', title: 'BS', user: { fullName: 'An' } };
const visit = (status: string, extra = {}) => ({ id: 'v1', date: '2026-11-02T00:00:00.000Z', queueNumber: 4, source: 'WALK_IN', checkinMethod: 'RECEPTION', status, reason: 'Đau đầu', appointmentId: null, createdAt: '2026-11-02T01:00:00.000Z', patient, doctor, ...extra });

function mockApi(queue: unknown[], detail?: unknown) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/queue/doctor') return { data: queue };
    if (url === '/visits/v1') return { data: detail };
    if (url === '/visits/history') return { data: [] };
    return { data: { items: [], total: 0, page: 1, pageSize: 20 } };
  });
}

describe('Màn hình khám bệnh', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gợi ý số lượng thuốc = số lần/ngày × số ngày', () => {
    expect(suggestQuantity(3, 5)).toBe(15);
    expect(suggestQuantity(undefined, 5)).toBeUndefined();
  });

  it('có người chờ thì gọi được số tiếp theo', async () => {
    mockApi([visit('WAITING')]);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: visit('IN_PROGRESS') });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByRole('button', { name: 'Gọi số tiếp theo' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/queue/call-next'));
  });

  it('đang khám: hiện cảnh báo dị ứng; chưa có bệnh án thì chưa hoàn tất được', async () => {
    mockApi([visit('IN_PROGRESS')], { ...visit('IN_PROGRESS'), medicalRecord: null, prescriptions: [], prescription: null });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    expect(await screen.findByText('Dị ứng: Penicillin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang khám số 4' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hoàn tất lượt khám' })).toBeDisabled();
    expect(screen.getByText('Cần lưu bệnh án trước khi hoàn tất.')).toBeInTheDocument();
  });

  it('lưu bệnh án gửi đúng dữ liệu', async () => {
    mockApi([visit('IN_PROGRESS')], { ...visit('IN_PROGRESS'), medicalRecord: null, prescriptions: [], prescription: null });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    await userEvent.type(await screen.findByLabelText('Triệu chứng'), 'Đau đầu 3 ngày');
    await userEvent.type(screen.getByLabelText('Chẩn đoán'), 'Đau nửa đầu');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu bệnh án' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/visits/v1/record', expect.objectContaining({ symptoms: 'Đau đầu 3 ngày', diagnosis: 'Đau nửa đầu' })));
  });
});
