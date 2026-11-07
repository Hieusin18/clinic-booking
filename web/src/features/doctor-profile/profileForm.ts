import { api } from '../../lib/api';
import type { Doctor, HistoryItem } from '../../lib/types';

/** Một dòng trong form quá trình đào tạo/công tác. `current` = đang làm (đến nay). */
export type HistoryRow = { fromYear?: number | null; toYear?: number | null; current?: boolean; title?: string; place?: string };

export type ProfileFormValues = {
  bio?: string;
  practiceSince?: number | null;
  expertise?: string[];
  education?: HistoryRow[];
  career?: HistoryRow[];
};

const toRow = (h: HistoryItem): HistoryRow => ({ fromYear: h.fromYear, toYear: h.toYear, current: h.toYear == null, title: h.title, place: h.place });

/** Điền form từ hồ sơ đang có. */
export function toProfileForm(d: Doctor): ProfileFormValues {
  return {
    bio: d.bio ?? '',
    practiceSince: d.practiceSince,
    expertise: d.expertise,
    education: (d.education ?? []).map(toRow),
    career: (d.career ?? []).map(toRow),
  };
}

/** Bỏ dòng trống; đang làm thì không có năm kết thúc. */
function toItems(rows: HistoryRow[] = []) {
  return rows
    .filter((r) => r.title?.trim() || r.place?.trim())
    .map((r) => ({
      fromYear: r.fromYear as number,
      toYear: r.current ? null : (r.toYear ?? null),
      title: (r.title ?? '').trim(),
      place: (r.place ?? '').trim(),
    }));
}

/** Dữ liệu gửi lên PATCH /doctors/:id hoặc /doctors/me. */
export function toProfilePayload(v: ProfileFormValues) {
  return {
    bio: (v.bio ?? '').trim(),
    practiceSince: v.practiceSince ?? null,
    expertise: (v.expertise ?? []).map((e) => e.trim()).filter(Boolean),
    education: toItems(v.education),
    career: toItems(v.career),
  };
}

/** Khoảng năm: "2018 – nay", "2011 – 2018", "2015" */
export function yearRange(h: Pick<HistoryItem, 'fromYear' | 'toYear'>) {
  if (h.toYear == null) return `${h.fromYear} – nay`;
  return h.toYear === h.fromYear ? String(h.fromYear) : `${h.fromYear} – ${h.toYear}`;
}

/** Địa chỉ ảnh đại diện (đổi ?v khi ảnh đổi nên trình duyệt không giữ ảnh cũ). */
export function avatarUrl(d: Pick<Doctor, 'id' | 'avatarVersion'>) {
  return d.avatarVersion == null ? undefined : `${api.defaults.baseURL}/doctors/${d.id}/avatar?v=${d.avatarVersion}`;
}

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Kiểm tra trước khi tải ảnh lên (backend kiểm tra lại theo nội dung file). */
export function avatarProblem(file: { type: string; size: number }) {
  if (!AVATAR_TYPES.includes(file.type)) return 'Ảnh phải là JPG, PNG hoặc WebP';
  if (file.size > AVATAR_MAX_BYTES) return 'Ảnh tối đa 2 MB';
  return null;
}
