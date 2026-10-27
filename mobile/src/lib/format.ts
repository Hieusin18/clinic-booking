/** Định dạng ngày giờ theo giờ Việt Nam. */
const TZ = 'Asia/Ho_Chi_Minh';

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Cột @db.Date ("YYYY-MM-DDT00:00:00.000Z"): đọc theo UTC để không lệch ngày. */
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

/** "YYYY-MM-DD" theo giờ Việt Nam, cách hôm nay `offset` ngày. */
export const ymd = (offset = 0, now = new Date()) =>
  new Date(now.getTime() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Nhãn ngắn cho dải chọn ngày: "Hôm nay", "Ngày mai", "T4 04/11" (tự ghép để giống nhau trên mọi máy). */
export function dayLabel(offset: number, now = new Date()) {
  if (offset === 0) return 'Hôm nay';
  if (offset === 1) return 'Ngày mai';
  const [y, m, d] = ymd(offset, now).split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export const doctorName = (d: { title: string | null; user: { fullName: string } }) =>
  [d.title, d.user.fullName].filter(Boolean).join(' ');

export const GENDER_LABEL = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' } as const;
