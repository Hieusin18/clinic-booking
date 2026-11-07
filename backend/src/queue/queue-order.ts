/**
 * Thứ tự gọi số. Mỗi lần bác sĩ bấm "Gọi số tiếp theo", xét lần lượt:
 *
 *  0. Người quay lại với kết quả cận lâm sàng (đã khám, chỉ cần bác sĩ đọc kết quả và kết luận)
 *     → gọi người có kết quả sớm nhất. Lượt này không tính vào chuỗi ưu tiên ở bước 1.
 *  1. Người vãng lai chờ quá lâu: đã có `walkInEvery` lượt liên tiếp gọi người đặt lịch (bước 2)
 *     mà vẫn còn người vãng lai chờ → gọi người vãng lai đến quầy sớm nhất.
 *  2. Người đặt lịch đã đến giờ hẹn (bây giờ ≥ giờ hẹn − `leadMinutes`) → gọi người có giờ hẹn sớm nhất.
 *  3. Còn lại → gọi người đến quầy sớm nhất (gồm cả người đặt lịch đến sớm, để bác sĩ không phải chờ).
 *
 * Cùng một hàm dùng để gọi số và để dự đoán "trước bạn còn mấy người", nên con số
 * hiện trên app luôn khớp với cách bác sĩ gọi.
 */
export type CallRuleName = 'FAIRNESS' | 'APPOINTMENT' | 'ARRIVAL' | 'MANUAL' | 'RESULTS';

export interface QueueEntry {
  id: string;
  source: 'ONLINE' | 'WALK_IN';
  queueNumber: number;
  /** Lúc lấy số / check-in, tức thứ tự đến quầy */
  createdAt: Date;
  /** Giờ hẹn, chỉ có ở lượt đặt online */
  appointmentAt: Date | null;
  /** Lúc quay lại hàng chờ với kết quả cận lâm sàng */
  resultsReadyAt?: Date | null;
}

export interface OrderRules {
  /** Người đặt lịch được ưu tiên từ giờ hẹn trừ chừng này phút */
  leadMinutes: number;
  /** Sau chừng này lượt ưu tiên liên tiếp thì gọi một người vãng lai; 0 = tắt */
  walkInEvery: number;
  /** Thời gian khám trung bình, chỉ dùng để ước tính giờ được gọi */
  avgExamMinutes: number;
}

const MINUTE = 60_000;

/** Người đặt lịch đã "đến giờ hẹn" tại thời điểm `at` chưa. */
export function isDue(e: QueueEntry, at: Date, rules: Pick<OrderRules, 'leadMinutes'>): boolean {
  return e.source === 'ONLINE' && e.appointmentAt != null && e.appointmentAt.getTime() - rules.leadMinutes * MINUTE <= at.getTime();
}

const byArrival = (a: QueueEntry, b: QueueEntry) => a.createdAt.getTime() - b.createdAt.getTime() || a.queueNumber - b.queueNumber;

/** Chọn người được gọi tiếp theo trong số đang chờ. `streak` = số lượt bước 2 liên tiếp gần nhất. */
export function pickNext<T extends QueueEntry>(waiting: T[], streak: number, at: Date, rules: OrderRules): { entry: T; rule: CallRuleName } | null {
  if (waiting.length === 0) return null;

  const back = waiting
    .filter((e) => e.resultsReadyAt)
    .sort((a, b) => a.resultsReadyAt!.getTime() - b.resultsReadyAt!.getTime() || byArrival(a, b))[0];
  if (back) return { entry: back, rule: 'RESULTS' };

  if (rules.walkInEvery > 0 && streak >= rules.walkInEvery) {
    const walkIn = waiting.filter((e) => e.source === 'WALK_IN').sort(byArrival)[0];
    if (walkIn) return { entry: walkIn, rule: 'FAIRNESS' };
  }

  const due = waiting
    .filter((e) => isDue(e, at, rules))
    .sort((a, b) => a.appointmentAt!.getTime() - b.appointmentAt!.getTime() || byArrival(a, b))[0];
  if (due) return { entry: due, rule: 'APPOINTMENT' };

  return { entry: [...waiting].sort(byArrival)[0], rule: 'ARRIVAL' };
}

/** Lượt không làm đổi chuỗi ưu tiên: bác sĩ chọn đích danh, hoặc đọc kết quả cận lâm sàng. */
const NEUTRAL: readonly (CallRuleName | null)[] = ['MANUAL', 'RESULTS'];

/** Số lượt bước 2 liên tiếp sau khi gọi theo `rule`. */
export function nextStreak(streak: number, rule: CallRuleName): number {
  if (NEUTRAL.includes(rule)) return streak;
  return rule === 'APPOINTMENT' ? streak + 1 : 0;
}

/** Đếm số lượt bước 2 liên tiếp từ các lượt đã gọi trong ngày, mới nhất trước. */
export function currentStreak(recent: (CallRuleName | null)[]): number {
  let n = 0;
  for (const rule of recent) {
    if (NEUTRAL.includes(rule)) continue;
    if (rule !== 'APPOINTMENT') break;
    n++;
  }
  return n;
}

export interface Predicted<T> {
  entry: T;
  /** 0 = người tiếp theo */
  order: number;
  /** Ước tính giờ được gọi */
  estimatedAt: Date;
}

/**
 * Dự đoán thứ tự gọi cho toàn bộ người đang chờ: chạy thử `pickNext` liên tục,
 * mỗi lượt khám mất `avgExamMinutes`. `busyUntil` = lúc bác sĩ xong lượt đang khám (nếu có).
 * Không biết trước ai sắp đến nên đây chỉ là ước tính.
 */
export function predictOrder<T extends QueueEntry>(waiting: T[], streak: number, now: Date, rules: OrderRules, busyUntil?: Date): Predicted<T>[] {
  const left = [...waiting];
  const out: Predicted<T>[] = [];
  let at = Math.max(now.getTime(), busyUntil?.getTime() ?? 0);
  let s = streak;
  while (left.length > 0) {
    const pick = pickNext(left, s, new Date(at), rules)!;
    out.push({ entry: pick.entry, order: out.length, estimatedAt: new Date(at) });
    left.splice(left.indexOf(pick.entry), 1);
    s = nextStreak(s, pick.rule);
    at += rules.avgExamMinutes * MINUTE;
  }
  return out;
}

/** Nhãn số hiển thị: A01 (đặt lịch), B03 (vãng lai). */
export function ticketLabel(v: { source: 'ONLINE' | 'WALK_IN'; queueNumber: number }): string {
  return `${v.source === 'ONLINE' ? 'A' : 'B'}${String(v.queueNumber).padStart(2, '0')}`;
}
