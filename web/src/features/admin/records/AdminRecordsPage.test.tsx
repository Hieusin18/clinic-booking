import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import type { AdminRecordRow, RecordEvent } from '../../../lib/types';
import { fakeUser, page, renderPage } from '../../../test/render';
import { AdminRecordsPage } from './AdminRecordsPage';
import { fieldValue } from './recordFields';

const row = {
  id: 'v1',
  date: '2026-11-18T00:00:00.000Z',
  queueNumber: 3,
  source: 'WALK_IN',
  checkinMethod: 'RECEPTION',
  status: 'DONE',
  reason: null,
  appointmentId: null,
  createdAt: '2026-11-18T02:00:00.000Z',
  labOrders: [],
  patient: { id: 'p1', fullName: 'Lê Thị Mai', phone: '0901111111', dateOfBirth: '1990-01-01T00:00:00.000Z', gender: 'FEMALE', allergies: null },
  doctor: { id: 'd1', title: 'BS', user: { fullName: 'Nguyễn An' }, specialty: { id: 's', name: 'Nội khoa' } },
  medicalRecord: { diagnosis: 'Viêm amidan', icdCode: 'J03', followUpDate: null },
  recordUpdatedAt: '2026-11-18T05:00:00.000Z',
  history: { revisions: 3, editedAfterDone: true },
} as unknown as AdminRecordRow;

const events: RecordEvent[] = [
  { kind: 'RECORD', id: 'r1', version: 1, action: 'CREATE', at: '2026-11-18T02:10:00.000Z', afterDone: false, editedBy: { id: 'u', fullName: 'Nguyễn An', role: 'DOCTOR' }, changes: [{ field: 'diagnosis', before: null, after: 'Viêm họng' }] },
  { kind: 'PRESCRIPTION', id: 'rx', action: 'FINALIZED', at: '2026-11-18T02:20:00.000Z', code: 'DT123' },
  {
    kind: 'RECORD',
    id: 'r2',
    version: 2,
    action: 'UPDATE',
    at: '2026-11-18T05:00:00.000Z',
    afterDone: true,
    editedBy: { id: 'u', fullName: 'Nguyễn An', role: 'DOCTOR' },
    changes: [
      { field: 'diagnosis', before: 'Viêm họng', after: 'Viêm amidan' },
      { field: 'temperature', before: 37.5, after: 38 },
    ],
  },
];

describe('Admin xem hồ sơ bệnh án', () => {
  afterEach(() => vi.restoreAllMocks());

  it('định dạng giá trị ô bệnh án', () => {
    expect(fieldValue('temperature', 37.5)).toBe('37,5 °C');
    expect(fieldValue('followUpDate', '2026-11-25')).toBe('25/11/2026');
    expect(fieldValue('diagnosis', '')).toBeNull();
  });

  it('danh sách bệnh án, mở chi tiết và xem lịch sử sửa', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/admin/records') return { data: { items: [row], total: 1, page: 1, pageSize: 20 } };
      if (url === '/visits/v1/record.html') return { data: '<h1>BỆNH ÁN</h1>' };
      if (url === '/visits/v1/record/history') return { data: events };
      return { data: { items: [], total: 0, page: 1, pageSize: 100 } };
    });
    renderPage([page('/', <AdminRecordsPage />)], { user: fakeUser('ADMIN') });

    expect(await screen.findByText('Lê Thị Mai')).toBeInTheDocument();
    expect(screen.getByText('3 lần lưu')).toBeInTheDocument();
    expect(screen.getByText('Sửa sau khi hoàn tất')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Lê Thị Mai'));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByTitle('Bệnh án')).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole('tab', { name: /Lịch sử chỉnh sửa/ }));
    expect(await within(drawer).findByText('Lần 2 · Sửa bệnh án')).toBeInTheDocument();
    expect(within(drawer).getByText('Sửa sau khi đã hoàn tất lượt khám')).toBeInTheDocument();
    expect(within(drawer).getByText('Hoàn tất đơn thuốc DT123')).toBeInTheDocument();
    expect(within(drawer).getByText('37,5 °C')).toBeInTheDocument();
    expect(within(drawer).getByText('38 °C')).toBeInTheDocument();
  });
});
