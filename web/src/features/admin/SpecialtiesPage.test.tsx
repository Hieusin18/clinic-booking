import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { SpecialtiesPage } from './SpecialtiesPage';

const data = {
  items: [
    { id: 's1', name: 'Nhi khoa', description: 'Trẻ em', _count: { doctors: 2 } },
    { id: 's2', name: 'Da liễu', description: null, _count: { doctors: 0 } },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
};

describe('Trang chuyên khoa', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện danh sách; chuyên khoa còn bác sĩ thì không bấm xóa được', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data });
    renderPage([page('/', <SpecialtiesPage />)], { user: fakeUser('ADMIN') });
    const row = (await screen.findByText('Nhi khoa')).closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Xóa' })).toBeDisabled();
    const empty = screen.getByText('Da liễu').closest('tr')!;
    expect(within(empty).getByRole('button', { name: 'Xóa' })).toBeEnabled();
  });

  it('thêm chuyên khoa gửi đúng dữ liệu lên API', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderPage([page('/', <SpecialtiesPage />)], { user: fakeUser('ADMIN') });
    await userEvent.click(await screen.findByRole('button', { name: /Thêm chuyên khoa/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tên chuyên khoa'), 'Tim mạch');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/specialties', { name: 'Tim mạch', description: '' }));
  });
});
