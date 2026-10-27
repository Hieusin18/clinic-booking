import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from './api';
import type { Page } from './types';

/** Danh sách có phân trang + ô tìm kiếm, dùng cho các bảng quản lý. */
export function usePagedList<T>(key: string, url: string, extra: Record<string, unknown> = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState('');
  const params = { page, pageSize, ...(q ? { q } : {}), ...extra };
  const query = useQuery({
    queryKey: [key, params],
    queryFn: async () => (await api.get<Page<T>>(url, { params })).data,
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    search: (value: string) => {
      setQ(value.trim());
      setPage(1);
    },
    pagination: {
      current: page,
      pageSize,
      total: query.data?.total ?? 0,
      showSizeChanger: true,
      onChange: (p: number, s: number) => {
        setPage(p);
        setPageSize(s);
      },
    },
  };
}

/** Mutation có sẵn thông báo thành công/thất bại và làm mới các danh sách liên quan. */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  { success, invalidate = [] }: { success?: string; invalidate?: string[] } = {},
) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) message.success(success);
      invalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => message.error(errorMessage(err)),
  });
}
