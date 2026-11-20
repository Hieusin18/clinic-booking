import type { Dayjs } from 'dayjs';

/** Ca mẫu khi xếp ca trực lễ tân */
export const SHIFT_PRESETS = [
  { label: 'Sáng', start: '07:00', end: '12:00' },
  { label: 'Chiều', start: '12:00', end: '17:00' },
  { label: 'Tối', start: '17:00', end: '21:00' },
  { label: 'Cả ngày', start: '07:00', end: '17:00' },
] as const;

/** 7 ngày "YYYY-MM-DD" của tuần bắt đầu từ weekStart */
export function weekDays(weekStart: Dayjs) {
  return Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
}

/** Gom ca theo ngày (date dạng YYYY-MM-DD hoặc YYYY-MM-DDT…) */
export function byDay<T extends { date: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = it.date.slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return map;
}

/** Tổng số giờ làm của các ca, làm tròn 0,5 giờ: "37,5 giờ" */
export function totalHours(items: { startTime: string; endTime: string }[]) {
  const ms = items.reduce((sum, s) => sum + (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()), 0);
  const h = Math.round((ms / 3_600_000) * 2) / 2;
  return `${h.toLocaleString('vi-VN')} giờ`;
}
