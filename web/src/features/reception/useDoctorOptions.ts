import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { doctorName } from '../../lib/format';
import type { Doctor, Page } from '../../lib/types';

/** Bác sĩ đang hoạt động, gom theo chuyên khoa cho ô chọn. */
export function useDoctorOptions() {
  const query = useQuery({
    queryKey: ['doctors', 'options'],
    queryFn: async () => (await api.get<Page<Doctor>>('/doctors', { params: { pageSize: 100 } })).data.items,
  });
  const groups = new Map<string, { label: string; options: { value: string; label: string }[] }>();
  for (const d of query.data ?? []) {
    const g = groups.get(d.specialty.id) ?? { label: d.specialty.name, options: [] };
    g.options.push({ value: d.id, label: doctorName(d) });
    groups.set(d.specialty.id, g);
  }
  return { ...query, options: [...groups.values()] };
}
