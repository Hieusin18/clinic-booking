import type { DayAvailability, Doctor, HistoryItem } from './types';

/** Địa chỉ ảnh đại diện; `?v=` đổi khi ảnh đổi nên app không giữ ảnh cũ. */
export function avatarUri(apiUrl: string, d: Pick<Doctor, 'id' | 'avatarVersion'>) {
  return d.avatarVersion == null ? null : `${apiUrl}/doctors/${d.id}/avatar?v=${d.avatarVersion}`;
}

/** Chữ cái hiện thay ảnh: chữ đầu của tên (phần cuối họ tên). */
export const initial = (fullName: string) => fullName.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? '?';

/** "15 năm kinh nghiệm"; dưới 1 năm thì "Mới hành nghề"; chưa nhập thì null. */
export function experienceText(d: Pick<Doctor, 'experienceYears'>) {
  if (d.experienceYears == null) return null;
  return d.experienceYears < 1 ? 'Mới hành nghề' : `${d.experienceYears} năm kinh nghiệm`;
}

/** Khoảng năm: "2018 – nay", "2011 – 2018", "2015" */
export function yearRange(h: Pick<HistoryItem, 'fromYear' | 'toYear'>) {
  if (h.toYear == null) return `${h.fromYear} – nay`;
  return h.toYear === h.fromYear ? String(h.fromYear) : `${h.fromYear} – ${h.toYear}`;
}

/** Công việc hiện tại (mốc công tác "đến nay" đầu tiên), vd "Trưởng khoa Nội · Phòng khám Đa khoa". */
export function currentPosition(d: Pick<Doctor, 'career'>) {
  const now = d.career?.find((c) => c.toYear == null);
  return now ? `${now.title} · ${now.place}` : null;
}

/** Hồ sơ chưa có gì ngoài tên và chuyên khoa. */
export const isEmptyProfile = (d: Doctor) =>
  !d.bio && d.expertise.length === 0 && !d.career?.length && !d.education?.length && d.experienceYears == null;

/** Tóm tắt lịch trống: "Còn 12 chỗ trống trong 7 ngày tới" / "Hết chỗ trống trong 7 ngày tới". */
export function availabilitySummary(days: DayAvailability[]) {
  const total = days.reduce((n, d) => n + d.free, 0);
  return total ? `Còn ${total} chỗ trống trong ${days.length} ngày tới` : `Hết chỗ trống trong ${days.length} ngày tới`;
}
