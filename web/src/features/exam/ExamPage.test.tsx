import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import dayjs from 'dayjs';
import { ExamPage, suggestQuantity } from './ExamPage';
import { bmi, toRecordPayload } from './RecordCard';

const patient = { id: 'p1', fullName: 'Vũ Thị Khám', phone: '0902222222', dateOfBirth: '1980-01-01T00:00:00.000Z', gender: 'FEMALE', allergies: 'Penicillin' };
const doctor = { id: 'd1', title: 'BS', user: { fullName: 'An' } };
const visit = (status: string, extra = {}) => ({ id: 'v1', date: '2026-11-02T00:00:00.000Z', queueNumber: 4, source: 'WALK_IN', checkinMethod: 'RECEPTION', status, reason: 'Đau đầu', appointmentId: null, createdAt: '2026-11-02T01:00:00.000Z', patient, doctor, ...extra });

function mockApi(queue: unknown[], detail?: unknown) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/queue/doctor') return { data: queue };
    if (url === '/visits/v1') return { data: detail };
    if (url === '/visits/history') return { data: [] };
    if (url === '/icd10') return { data: [{ code: 'G43.9', name: 'Migraine, không đặc hiệu' }] };
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

  it('hàng chờ xếp theo thứ tự gọi dự kiến; bác sĩ gọi đích danh được một người', async () => {
    mockApi([
      visit('WAITING', { id: 'v2', queueNumber: 2, predictedOrder: 1, patient: { ...patient, fullName: 'Người Thứ Hai' } }),
      visit('WAITING', { id: 'v3', queueNumber: 1, source: 'ONLINE', appointmentAt: '2026-11-02T01:30:00.000Z', due: true, predictedOrder: 0 }),
    ]);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: visit('IN_PROGRESS', { id: 'v2' }) });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    const labels = (await screen.findAllByText(/^[AB]\d\d$/)).map((el) => el.textContent);
    expect(labels).toEqual(['A01', 'B02']);
    expect(screen.getByText('Hẹn 08:30 · đến giờ')).toBeInTheDocument();
    expect(screen.getByText('Tiếp theo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gọi số B02' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Gọi' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/queue/v2/call'));
  });

  it('đang khám: hiện cảnh báo dị ứng; chưa có bệnh án thì chưa hoàn tất được', async () => {
    mockApi([visit('IN_PROGRESS')], { ...visit('IN_PROGRESS'), medicalRecord: null, prescriptions: [], prescription: null });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    expect(await screen.findByText('Dị ứng: Penicillin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang khám số B04' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hoàn tất lượt khám' })).toBeDisabled();
    expect(screen.getByText('Cần lưu bệnh án trước khi hoàn tất.')).toBeInTheDocument();
  });

  it('lưu bệnh án gửi đúng dữ liệu; lý do khám điền sẵn từ phiếu', async () => {
    mockApi([visit('IN_PROGRESS')], { ...visit('IN_PROGRESS'), medicalRecord: null, prescriptions: [], prescription: null });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    expect(await screen.findByLabelText('Lý do đến khám')).toHaveValue('Đau đầu');
    await userEvent.type(screen.getByLabelText('Quá trình bệnh lý'), 'Đau đầu 3 ngày');
    await userEvent.type(screen.getByLabelText('Mạch'), '80');
    await userEvent.type(screen.getByLabelText('Bệnh chính'), 'Đau nửa đầu');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu bệnh án' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/visits/v1/record',
        expect.objectContaining({ reason: 'Đau đầu', symptoms: 'Đau đầu 3 ngày', pulse: 80, diagnosis: 'Đau nửa đầu', icdCode: null, followUpDate: null }),
      ),
    );
  });

  it('chọn mã ICD-10 thì điền sẵn tên bệnh khi ô chẩn đoán còn trống', async () => {
    mockApi([visit('IN_PROGRESS')], { ...visit('IN_PROGRESS'), medicalRecord: null, prescriptions: [], prescription: null });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    await userEvent.type(await screen.findByLabelText('Mã ICD-10'), 'migr');
    await userEvent.click(await screen.findByText('G43.9 – Migraine, không đặc hiệu'));
    expect(screen.getByLabelText('Bệnh chính')).toHaveValue('Migraine, không đặc hiệu');
    expect(screen.getByLabelText('Mã ICD-10')).toHaveValue('G43.9');
  });

  it('đã có bệnh án thì tải được PDF và Word', async () => {
    const record = { id: 'r1', symptoms: 'Đau đầu', diagnosis: 'Migraine', icdCode: 'G43.9', followUpDate: '2026-11-09T00:00:00.000Z' };
    mockApi([visit('IN_PROGRESS')], { ...visit('IN_PROGRESS'), medicalRecord: record, prescriptions: [], prescription: null });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    expect(await screen.findByRole('button', { name: /Tải PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tải Word/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cập nhật bệnh án' })).toBeInTheDocument();
  });
});

describe('Xem trước bản điện tử', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mở bản xem trước ngay trên trang, tải được từ hộp xem trước', async () => {
    const record = { id: 'r1', symptoms: 'Đau đầu', diagnosis: 'Migraine', icdCode: 'G43.9', followUpDate: null };
    const detail = { ...visit('IN_PROGRESS'), medicalRecord: record, prescriptions: [], prescription: null };
    const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/queue/doctor') return { data: [visit('IN_PROGRESS')] };
      if (url === '/visits/v1') return { data: detail };
      if (url === '/visits/v1/record.html') return { data: '<!doctype html><h1>BỆNH ÁN NGOẠI TRÚ</h1>' };
      return { data: [] };
    });
    renderPage([page('/', <ExamPage />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByRole('button', { name: /Xem trước/ }));
    const frame = await screen.findByTitle('Bản xem trước bệnh án');
    expect(frame).toHaveAttribute('srcdoc', '<!doctype html><h1>BỆNH ÁN NGOẠI TRÚ</h1>');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(get).toHaveBeenCalledWith('/visits/v1/record.html', { responseType: 'text' });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Tải PDF/ })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: /Tải Word/ })).toBeEnabled();
  });
});

describe('Dữ liệu bệnh án', () => {
  it('ô trống gửi null, ngày tái khám dạng YYYY-MM-DD', () => {
    expect(toRecordPayload({ symptoms: 'Sốt', diagnosis: 'Sốt', organExam: '', pulse: undefined, followUpDate: dayjs('2026-11-10') } as never)).toEqual({
      symptoms: 'Sốt',
      diagnosis: 'Sốt',
      organExam: null,
      pulse: null,
      followUpDate: '2026-11-10',
    });
  });

  it('tính BMI', () => {
    expect(bmi(68, 172)).toBe(23);
    expect(bmi(68, null)).toBeNull();
  });
});
