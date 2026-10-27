/** Định dạng ngày giờ theo giờ Việt Nam, bất kể múi giờ của máy đang mở trang. */
const TZ = 'Asia/Ho_Chi_Minh';

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

/** Cột @db.Date trả về "YYYY-MM-DDT00:00:00.000Z": đọc theo UTC để không bị lệch ngày. */
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

/** "YYYY-MM-DD" hôm nay theo giờ Việt Nam. */
export const todayYmd = (at = new Date()) => at.toLocaleDateString('en-CA', { timeZone: TZ });

/** Tuổi tính từ ngày sinh (cột @db.Date). */
export function age(dateOfBirth: string, now = new Date()) {
  const dob = new Date(dateOfBirth);
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export const GENDER_LABEL = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' } as const;

export const doctorName = (d: { title: string | null; user: { fullName: string } }) =>
  [d.title, d.user.fullName].filter(Boolean).join(' ');
