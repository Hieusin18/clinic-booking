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

/** "DD/MM/YYYY" người dùng gõ → "YYYY-MM-DD" gửi API; sai định dạng hoặc ngày không có thật → null. */
export function parseVnDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > Date.now()) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "YYYY-MM-DDT00:00:00.000Z" (cột ngày) → "DD/MM/YYYY" để hiện trong ô nhập. */
export const toVnDateInput = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const PHONE_REGEX = /^0\d{9}$/;
