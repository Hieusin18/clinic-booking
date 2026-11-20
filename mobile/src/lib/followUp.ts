/** Hẹn tái khám (logic thuần để test được). */
import { ymd } from './format';

/** Số ngày từ hôm nay (giờ Việt Nam) đến ngày tái khám "YYYY-MM-DD…"; âm = đã qua */
export function daysUntil(date: string, now = new Date()): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(date) - toUtc(ymd(0, now))) / 86_400_000);
}

/** Màn đặt lịch hiện 7 ngày; mở với ngày đã chọn ở xa thì cửa sổ bắt đầu từ trước ngày đó 3 ngày */
export const BOOK_DAYS = 7;
export const BOOK_MAX_OFFSET = 60;

export function bookWindowStart(target: number): number {
  return target < BOOK_DAYS ? 0 : target - 3;
}
