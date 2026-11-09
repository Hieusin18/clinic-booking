import type { OrderRules } from './queue-order.util.js';

/** Các mốc thời gian của hàng đợi; đổi được trong .env mà không phải sửa code. */
export interface QueueRules extends OrderRules {
  /** Được check-in lịch hẹn sớm nhất trước giờ hẹn chừng này phút */
  checkinEarlyMinutes: number;
  /** Quá giờ hẹn chừng này phút mà chưa check-in thì lịch hẹn thành "không đến" */
  checkinLateMinutes: number;
  /** Sau giờ này (giờ Việt Nam) người còn đang chờ được tính là bỏ về */
  dayEndHour: number;
  /** Không đến chừng này lần trong `noShowWindowDays` ngày thì bị khóa đặt lịch online */
  noShowLimit: number;
  noShowWindowDays: number;
  noShowLockDays: number;
}

export const DEFAULT_RULES: QueueRules = {
  leadMinutes: 10,
  walkInEvery: 3,
  avgExamMinutes: 12,
  checkinEarlyMinutes: 30,
  checkinLateMinutes: 15,
  dayEndHour: 21,
  noShowLimit: 3,
  noShowWindowDays: 30,
  noShowLockDays: 14,
};

const ENV: Record<keyof QueueRules, string> = {
  leadMinutes: 'QUEUE_PRIORITY_LEAD_MINUTES',
  walkInEvery: 'QUEUE_WALK_IN_EVERY',
  avgExamMinutes: 'QUEUE_AVG_EXAM_MINUTES',
  checkinEarlyMinutes: 'CHECKIN_EARLY_MINUTES',
  checkinLateMinutes: 'CHECKIN_LATE_MINUTES',
  dayEndHour: 'QUEUE_DAY_END_HOUR',
  noShowLimit: 'NO_SHOW_LIMIT',
  noShowWindowDays: 'NO_SHOW_WINDOW_DAYS',
  noShowLockDays: 'NO_SHOW_LOCK_DAYS',
};

/** Đọc từ biến môi trường; bỏ trống hoặc sai định dạng thì dùng giá trị mặc định. */
export function queueRules(config: { get(key: string): unknown }): QueueRules {
  const rules = { ...DEFAULT_RULES };
  for (const key of Object.keys(ENV) as (keyof QueueRules)[]) {
    const raw = config.get(ENV[key]);
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) rules[key] = n;
  }
  return rules;
}

const DAY = 86_400_000;

/**
 * Tình trạng "không đến" của một bệnh nhân. `dates` = ngày khám (cột @db.Date) của các lịch
 * hẹn bị tính là không đến. Đủ `noShowLimit` lần trong vòng `noShowWindowDays` ngày thì bị khóa
 * đặt lịch online đến hết ngày (lần gần nhất + `noShowLockDays`).
 */
export function noShowStanding(dates: Date[], today: Date, rules: Pick<QueueRules, 'noShowLimit' | 'noShowWindowDays' | 'noShowLockDays'>) {
  const sorted = dates.map((d) => d.getTime()).sort((a, b) => b - a);
  const recentNoShows = sorted.filter((t) => today.getTime() - t < rules.noShowWindowDays * DAY).length;
  let lockedUntil: Date | null = null;
  const k = rules.noShowLimit;
  if (k > 0) {
    for (let i = 0; i + k - 1 < sorted.length; i++) {
      if (sorted[i] - sorted[i + k - 1] < rules.noShowWindowDays * DAY) {
        const until = new Date(sorted[i] + rules.noShowLockDays * DAY);
        if (until.getTime() >= today.getTime()) lockedUntil = until;
        break;
      }
    }
  }
  return { recentNoShows, lockedUntil };
}
