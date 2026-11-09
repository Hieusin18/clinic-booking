import { dateOnly } from '../../common/utils/time.util.js';

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** Kỳ thống kê tối đa (ngày) */
export const MAX_RANGE_DAYS = 366;

/** Trung vị (làm tròn 1 chữ số thập phân); null nếu không có số liệu */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
}

/** Tỷ lệ phần trăm, 1 chữ số thập phân; null khi mẫu bằng 0 */
export function percent(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Các ngày "YYYY-MM-DD" từ from tới to (gồm cả hai đầu) */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dateOnly(from).getTime(); t <= dateOnly(to).getTime(); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
