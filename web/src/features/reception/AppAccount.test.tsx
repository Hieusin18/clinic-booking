import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { Visit } from '../../lib/types';
import { fakeUser, page, renderPage } from '../../test/render';
import { AppAccount } from './AppAccount';
import { TicketModal } from './TicketPrint';

const reception = fakeUser('RECEPTIONIST');
const account = (status: 'NONE' | 'UNVERIFIED' | 'VERIFIED') => ({ status, linkCode: 'K7M2QX', registeredAt: '2026-11-08T03:00:00.000Z', verifiedAt: null });

describe('Tài khoản app ở quầy tiếp đón', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chưa dùng app: hiện mã liên kết để đưa bệnh nhân', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: account('NONE') });
    renderPage([page('/', <AppAccount patientId="p1" />)], { user: reception });
    expect(await screen.findByText('K7M 2QX')).toBeInTheDocument();
    expect(screen.getByText('Chưa dùng app')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/patients/p1/account');
  });

  it('chưa xác minh: lễ tân đối chiếu CCCD rồi xác minh, hoặc gỡ tài khoản không phải chính chủ', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: account('UNVERIFIED') });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: account('VERIFIED') });
    renderPage([page('/', <AppAccount patientId="p1" />)], { user: reception });
    expect(await screen.findByText(/chưa xác minh/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Xác minh chính chủ/ }));
    await userEvent.click(within(await screen.findByRole('tooltip')).getByRole('button', { name: 'Xác minh' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/patients/p1/account/verify'));

    await userEvent.click(screen.getByRole('button', { name: /Không phải chính chủ/ }));
    const pop = (await screen.findAllByRole('tooltip')).find((t) => within(t).queryByText(/Gỡ tài khoản này/))!;
    await userEvent.click(within(pop).getByRole('button', { name: 'Gỡ tài khoản' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/patients/p1/account/detach'));
  });

  it('đã xác minh: chỉ hiện trạng thái, không lộ mã', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: account('VERIFIED') });
    renderPage([page('/', <AppAccount patientId="p1" />)], { user: reception });
    expect(await screen.findByText('Tài khoản app đã xác minh')).toBeInTheDocument();
    expect(screen.queryByText('K7M 2QX')).not.toBeInTheDocument();
  });

  it('phiếu số in mã liên kết khi bệnh nhân chưa dùng app', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: account('NONE') });
    const visit = {
      id: 'v1',
      source: 'WALK_IN',
      queueNumber: 3,
      createdAt: '2026-11-08T02:00:00.000Z',
      appointmentAt: null,
      patient: { id: 'p1', fullName: 'Nguyễn Thị A', phone: '0987000111' },
      doctor: { id: 'd1', title: 'BS', user: { fullName: 'An' } },
    } as unknown as Visit;
    renderPage([page('/', <TicketModal visit={visit} onClose={() => {}} />)], { user: reception });
    expect(await screen.findByText('K7M 2QX')).toBeInTheDocument();
    expect(screen.getByText(/đăng ký bằng SĐT 0987000111/)).toBeInTheDocument();
  });
});
