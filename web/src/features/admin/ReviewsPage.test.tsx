import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { AdminReview } from '../../lib/types';
import { fakeUser, page, renderPage } from '../../test/render';
import { ReviewsPage } from './ReviewsPage';

const review: AdminReview = {
  id: 'r1',
  visitId: 'v1',
  rating: 1,
  comment: 'Thái độ kém',
  hidden: false,
  hiddenReason: null,
  createdAt: '2026-11-20T03:00:00.000Z',
  updatedAt: '2026-11-20T03:00:00.000Z',
  patient: { id: 'p1', fullName: 'Trần Văn Bình' },
  doctor: { id: 'd1', title: 'BS', user: { fullName: 'Nguyễn An' } },
};

describe('Admin kiểm duyệt đánh giá', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lọc đánh giá thấp và ẩn góp ý', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) =>
      url === '/admin/reviews' ? { data: { items: [review], total: 1, page: 1, pageSize: 20 } } : { data: { items: [], total: 0, page: 1, pageSize: 100 } },
    );
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
    renderPage([page('/', <ReviewsPage />)], { user: fakeUser('ADMIN') });

    expect(await screen.findByText('Thái độ kém')).toBeInTheDocument();
    await userEvent.click(screen.getByText('1–2 sao'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/reviews', { params: { page: 1, pageSize: 20, maxRating: 2 } }));

    await userEvent.click(screen.getByRole('button', { name: /Ẩn/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ẩn' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/reviews/r1', { hidden: true, reason: 'Nội dung không phù hợp' }));
  });
});
