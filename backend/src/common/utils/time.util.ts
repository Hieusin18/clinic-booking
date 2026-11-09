/**
 * Tiện ích thời gian theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
 * Quy ước lưu trữ:
 *  - Cột @db.Date (ngày khám) lưu Date lúc 00:00 UTC của ngày theo lịch Việt Nam.
 *  - Cột thời điểm (startTime…) lưu thời điểm thật, dạng UTC.
 */
const TZ = 'Asia/Ho_Chi_Minh';

/** "YYYY-MM-DD" của một thời điểm, tính theo giờ Việt Nam. */
export function vnDateString(at = new Date()): string {
  return at.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Giá trị cho cột @db.Date từ chuỗi "YYYY-MM-DD". */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Ngày hôm nay theo giờ Việt Nam, dạng giá trị cột @db.Date. */
export function todayVN(now = new Date()): Date {
  return dateOnly(vnDateString(now));
}

/** Thời điểm thật của "YYYY-MM-DD" + "HH:mm" giờ Việt Nam. */
export function vnDateTime(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${hhmm}:00+07:00`);
}

/** "HH:mm" giờ Việt Nam của một thời điểm. */
export function vnTime(at: Date): string {
  return at.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
