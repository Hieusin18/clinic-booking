import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { fakeUser, page, renderPage } from '../../test/render';
import { DoctorsPage } from '../admin/DoctorsPage';
import { MyProfilePage } from './MyProfilePage';

const me = {
  id: 'd1',
  title: 'BSCKI',
  bio: 'Khám nội khoa',
  practiceSince: 2012,
  experienceYears: 14,
  expertise: ['Đái tháo đường'],
  avatarVersion: 7,
  specialty: { id: 's1', name: 'Nội tổng quát' },
  user: { id: 'u1', fullName: 'Trần Thị Bình', phone: '0910000002', email: null, isActive: true },
  education: [],
  career: [{ id: 'h1', fromYear: 2021, toYear: null, title: 'Phụ trách khoa Nội', place: 'Phòng khám' }],
};

describe('Hồ sơ bác sĩ trên web', () => {
  afterEach(() => vi.restoreAllMocks());

  it('bác sĩ thấy hồ sơ của mình, thêm nơi công tác cũ rồi lưu', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: me });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: me });
    renderPage([page('/', <MyProfilePage />)], { user: fakeUser('DOCTOR') });

    expect(await screen.findByDisplayValue('Phụ trách khoa Nội')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ảnh Trần Thị Bình' })).toHaveAttribute('src', '/api/doctors/d1/avatar?v=7');
    expect(screen.getByLabelText('Quá trình công tác 1: đến năm')).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Thêm nơi công tác/ }));
    await userEvent.type(screen.getByLabelText('Quá trình công tác 2: từ năm'), '2012');
    await userEvent.type(screen.getByLabelText('Quá trình công tác 2: đến năm'), '2021');
    await userEvent.type(screen.getByLabelText('Quá trình công tác 2: Chức vụ, vị trí'), 'Bác sĩ điều trị');
    await userEvent.type(screen.getByLabelText('Quá trình công tác 2: Nơi công tác'), 'Bệnh viện Thanh Nhàn');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/doctors/me', {
        bio: 'Khám nội khoa',
        practiceSince: 2012,
        expertise: ['Đái tháo đường'],
        education: [],
        career: [
          { fromYear: 2021, toYear: null, title: 'Phụ trách khoa Nội', place: 'Phòng khám' },
          { fromYear: 2012, toYear: 2021, title: 'Bác sĩ điều trị', place: 'Bệnh viện Thanh Nhàn' },
        ],
      }),
    );
  });

  it('năm kết thúc trước năm bắt đầu thì báo lỗi, không lưu', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...me, career: [] } });
    const patch = vi.spyOn(api, 'patch');
    renderPage([page('/', <MyProfilePage />)], { user: fakeUser('DOCTOR') });
    await userEvent.click(await screen.findByRole('button', { name: /Thêm nơi công tác/ }));
    await userEvent.type(screen.getByLabelText('Quá trình công tác 1: từ năm'), '2020');
    await userEvent.type(screen.getByLabelText('Quá trình công tác 1: đến năm'), '2015');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(await screen.findByText('Phải từ năm bắt đầu trở đi')).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('chọn file không phải ảnh thì báo lỗi, không tải lên', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: me });
    const post = vi.spyOn(api, 'post');
    const { container } = renderPage([page('/', <MyProfilePage />)], { user: fakeUser('DOCTOR') });
    await screen.findByDisplayValue('Phụ trách khoa Nội');
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['gif'], 'a.gif', { type: 'image/gif' })] } });
    expect(await screen.findByText('Ảnh phải là JPG, PNG hoặc WebP')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('tải ảnh lên gửi file tới đúng địa chỉ', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: me });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...me, avatarVersion: 8 } });
    const { container } = renderPage([page('/', <MyProfilePage />)], { user: fakeUser('DOCTOR') });
    await screen.findByDisplayValue('Phụ trách khoa Nội');
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['png'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(post).toHaveBeenCalledWith('/doctors/me/avatar', expect.any(FormData)));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Ảnh Trần Thị Bình' })).toHaveAttribute('src', '/api/doctors/d1/avatar?v=8'));
  });

  it('admin mở sửa bác sĩ: tải đủ hồ sơ, lưu kèm quá trình công tác', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/doctors/all') return { data: { items: [me], total: 1, page: 1, pageSize: 10 } };
      if (url === '/doctors/d1/full') return { data: me };
      return { data: { items: [], total: 0, page: 1, pageSize: 100 } };
    });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: me });
    renderPage([page('/', <DoctorsPage />)], { user: fakeUser('ADMIN') });
    expect(await screen.findByLabelText('14 năm kinh nghiệm')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByDisplayValue('Phụ trách khoa Nội')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/doctors/d1',
        expect.objectContaining({
          fullName: 'Trần Thị Bình',
          title: 'BSCKI',
          career: [{ fromYear: 2021, toYear: null, title: 'Phụ trách khoa Nội', place: 'Phòng khám' }],
        }),
      ),
    );
  });
});
