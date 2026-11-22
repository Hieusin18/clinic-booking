import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface ClinicSettings {
  /** Bác sĩ chỉ gọi bệnh nhân đã đo sinh hiệu */
  vitalsBeforeExam: boolean;
  /** Chỉ nhận khách vãng lai khi bác sĩ có ca và còn thời gian rảnh */
  walkInLimit: boolean;
}

/** Cài đặt quy trình của phòng khám (nhân viên đọc để hiện đúng nút, admin đổi) */
export function useClinicSettings(enabled = true) {
  return useQuery({
    queryKey: ['settings'],
    enabled,
    queryFn: async () => (await api.get<ClinicSettings>('/settings')).data,
    staleTime: 60_000,
  });
}
