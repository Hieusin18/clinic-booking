import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Page, Specialty } from '../../lib/types';

/** Danh sách chuyên khoa cho ô chọn (lấy tối đa 100). */
export function useSpecialtyOptions() {
  const query = useQuery({
    queryKey: ['specialties', 'options'],
    queryFn: async () => (await api.get<Page<Specialty>>('/specialties', { params: { pageSize: 100 } })).data.items,
  });
  return { ...query, options: (query.data ?? []).map((s) => ({ value: s.id, label: s.name })) };
}
