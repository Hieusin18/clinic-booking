import { useQuery } from '@tanstack/react-query';
import { Select } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Medicine, Page } from '../../lib/types';

export const medicineLabel = (m: Pick<Medicine, 'name' | 'strength' | 'unit'>) =>
  `${m.name}${m.strength ? ` ${m.strength}` : ''} (${m.unit})`;

/** Ô chọn thuốc có tìm kiếm theo tên/hoạt chất (gọi API sau khi ngừng gõ 300 ms). */
export function MedicineSelect({
  value,
  onChange,
  initialLabel,
}: {
  value?: string;
  onChange?: (id: string) => void;
  initialLabel?: string;
}) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const meds = useQuery({
    queryKey: ['medicines', 'search', q],
    queryFn: async () => (await api.get<Page<Medicine>>('/medicines', { params: { q: q || undefined, pageSize: 20 } })).data.items,
  });
  const options = (meds.data ?? []).map((m) => ({ value: m.id, label: medicineLabel(m) }));
  if (value && initialLabel && !options.some((o) => o.value === value)) options.unshift({ value, label: initialLabel });

  return (
    <Select
      showSearch={{ filterOption: false, onSearch: setInput }}
      value={value}
      onChange={onChange}
      options={options}
      loading={meds.isFetching}
      placeholder="Tìm thuốc theo tên hoặc hoạt chất"
      notFoundContent={meds.isFetching ? 'Đang tìm…' : 'Không có thuốc phù hợp'}
      style={{ width: '100%' }}
    />
  );
}
