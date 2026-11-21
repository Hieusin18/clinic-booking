import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatTime } from '../../lib/format';

/** GET /queue/capacity: bác sĩ nào hôm nay còn nhận khách vãng lai */
export interface DoctorCapacity {
  doctorId: string;
  hasShift: boolean;
  shiftEnd: string | null;
  shiftOver: boolean;
  /** Số khung giờ còn trống = số người còn nhận (mỗi khung một lượt, dùng chung với người đặt lịch) */
  remaining: number;
  /** Còn nhận (luôn true khi admin tắt giới hạn) */
  accepting: boolean;
}

export function useCapacity() {
  return useQuery({
    queryKey: ['queue', 'capacity'],
    queryFn: async () => (await api.get<DoctorCapacity[]>('/queue/capacity')).data,
    refetchInterval: 60_000,
  });
}

/** Ghi chú cạnh tên bác sĩ trong ô chọn: "còn 5 khung trống · hết ca 11:30", "không có ca", "kín lịch" */
export function capacityNote(c: DoctorCapacity | undefined): { text: string; full: boolean } | null {
  if (!c) return null;
  if (!c.hasShift) return { text: 'không có ca hôm nay', full: !c.accepting };
  if (c.shiftOver) return { text: `đã hết ca (${formatTime(c.shiftEnd!)})`, full: !c.accepting };
  if (c.remaining <= 0) return { text: `kín lịch đến ${formatTime(c.shiftEnd!)}`, full: !c.accepting };
  return { text: `còn ${c.remaining} khung trống · hết ca ${formatTime(c.shiftEnd!)}`, full: false };
}
