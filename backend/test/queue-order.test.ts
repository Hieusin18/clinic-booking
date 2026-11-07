import { describe, expect, it } from 'vitest';
import { currentStreak, nextStreak, pickNext, predictOrder, ticketLabel, type CallRuleName, type QueueEntry } from '../src/queue/queue-order.js';
import { DEFAULT_RULES, noShowStanding, queueRules } from '../src/queue/queue-rules.js';

/** Giờ Việt Nam trong một ngày cố định */
const at = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00+07:00`);
const rules = { leadMinutes: 10, walkInEvery: 3, avgExamMinutes: 12 };

type Named = QueueEntry & { name: string };
let n = 0;
const walkIn = (name: string, arrived: string): Named => ({ id: name, name, source: 'WALK_IN', queueNumber: ++n, createdAt: at(arrived), appointmentAt: null });
const booked = (name: string, arrived: string, appt: string): Named => ({
  id: name,
  name,
  source: 'ONLINE',
  queueNumber: ++n,
  createdAt: at(arrived),
  appointmentAt: at(appt),
});

/** Chạy một buổi khám: ở mỗi lần gọi, hàng chờ gồm người đã đến và chưa được gọi. */
function runSession(people: Named[], callTimes: string[]) {
  const called: { name: string; rule: CallRuleName }[] = [];
  let streak = 0;
  for (const t of callTimes) {
    const waiting = people.filter((p) => p.createdAt <= at(t) && !called.some((c) => c.name === p.name));
    const pick = pickNext(waiting, streak, at(t), rules);
    if (!pick) break;
    called.push({ name: pick.entry.name, rule: pick.rule });
    streak = nextStreak(streak, pick.rule);
  }
  return called;
}

describe('thứ tự gọi số', () => {
  it('ví dụ buổi sáng của BS Bình: ưu tiên giờ hẹn, người đến sớm không chiếm chỗ', () => {
    const people = [
      walkIn('Hùng', '07:40'),
      booked('Lan', '07:45', '08:00'),
      walkIn('Hoa', '07:50'),
      booked('Minh', '08:05', '08:30'),
      walkIn('Tuấn', '08:10'),
      booked('Ngọc', '08:20', '08:15'),
    ];
    expect(runSession(people, ['08:00', '08:12', '08:24', '08:36', '08:48', '09:00'])).toEqual([
      { name: 'Lan', rule: 'APPOINTMENT' },
      { name: 'Hùng', rule: 'ARRIVAL' },
      { name: 'Ngọc', rule: 'APPOINTMENT' },
      { name: 'Minh', rule: 'APPOINTMENT' },
      { name: 'Hoa', rule: 'ARRIVAL' },
      { name: 'Tuấn', rule: 'ARRIVAL' },
    ]);
  });

  it('sau 3 lượt ưu tiên liên tiếp thì gọi một người vãng lai', () => {
    const people = [
      walkIn('Mai', '08:50'),
      booked('A', '08:55', '09:00'),
      booked('B', '08:55', '09:12'),
      booked('C', '08:55', '09:24'),
      booked('D', '08:55', '09:36'),
    ];
    expect(runSession(people, ['09:00', '09:12', '09:24', '09:36', '09:48']).map((c) => `${c.name}:${c.rule}`)).toEqual([
      'A:APPOINTMENT',
      'B:APPOINTMENT',
      'C:APPOINTMENT',
      'Mai:FAIRNESS',
      'D:APPOINTMENT',
    ]);
  });

  it('walkInEvery = 0 thì tắt bước nhường người vãng lai', () => {
    const waiting = [walkIn('Mai', '08:00'), booked('D', '08:30', '09:00')];
    expect(pickNext(waiting, 10, at('09:00'), { ...rules, walkInEvery: 0 })?.entry.name).toBe('D');
  });

  it('người đặt lịch được ưu tiên từ giờ hẹn trừ 10 phút', () => {
    const waiting = [walkIn('Hùng', '08:00'), booked('Lan', '08:05', '08:30')];
    expect(pickNext(waiting, 0, at('08:19'), rules)?.entry.name).toBe('Hùng');
    expect(pickNext(waiting, 0, at('08:20'), rules)?.entry.name).toBe('Lan');
  });

  it('người quay lại với kết quả cận lâm sàng được gọi trước cả người đặt lịch đến giờ', () => {
    const lan = { ...booked('Lan', '08:00', '08:15') };
    const hung = { ...walkIn('Hùng', '07:50'), resultsReadyAt: at('08:40') };
    const mai = { ...walkIn('Mai', '07:55'), resultsReadyAt: at('08:30') };
    const pick = pickNext([lan, hung, mai], 3, at('08:45'), rules)!;
    // Mai có kết quả trước Hùng; bước nhường vãng lai (streak = 3) cũng đứng sau
    expect([pick.entry.name, pick.rule]).toEqual(['Mai', 'RESULTS']);
    // Đọc kết quả không làm đổi chuỗi ưu tiên
    expect(nextStreak(3, 'RESULTS')).toBe(3);
    expect(currentStreak(['RESULTS', 'APPOINTMENT', 'APPOINTMENT'])).toBe(2);
    const order = predictOrder([lan, hung, mai], 0, at('08:45'), rules).map((p) => p.entry.name);
    expect(order).toEqual(['Mai', 'Hùng', 'Lan']);
  });

  it('hàng chờ trống thì không gọi ai', () => expect(pickNext([], 0, at('08:00'), rules)).toBeNull());

  it('đếm lượt ưu tiên liên tiếp: bỏ qua lượt gọi đích danh, dừng ở lượt gọi khác', () => {
    expect(currentStreak(['APPOINTMENT', 'MANUAL', 'APPOINTMENT', 'ARRIVAL', 'APPOINTMENT'])).toBe(2);
    expect(currentStreak([null, 'APPOINTMENT'])).toBe(0);
    expect(nextStreak(2, 'MANUAL')).toBe(2);
    expect(nextStreak(2, 'FAIRNESS')).toBe(0);
  });

  it('dự đoán thứ tự: người vãng lai thấy cả người đặt lịch sẽ đến giờ trước mình', () => {
    const hung = walkIn('Hùng', '08:00');
    const lan = booked('Lan', '08:05', '08:20');
    const predicted = predictOrder([hung, lan], 0, at('08:00'), rules, at('08:10'));
    // Bác sĩ đang khám đến 08:10 → gọi Lan lúc 08:10 (đã đến giờ 08:20 − 10), rồi Hùng lúc 08:22
    expect(predicted.map((p) => [p.entry.name, p.order, p.estimatedAt.toISOString()])).toEqual([
      ['Lan', 0, at('08:10').toISOString()],
      ['Hùng', 1, at('08:22').toISOString()],
    ]);
  });

  it('nhãn số A cho đặt lịch, B cho vãng lai', () => {
    expect(ticketLabel({ source: 'ONLINE', queueNumber: 1 })).toBe('A01');
    expect(ticketLabel({ source: 'WALK_IN', queueNumber: 12 })).toBe('B12');
  });
});

describe('cấu hình và khóa đặt lịch', () => {
  const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

  it('đọc mốc thời gian từ biến môi trường, bỏ trống hoặc sai thì dùng mặc định', () => {
    const env: Record<string, string> = { CHECKIN_EARLY_MINUTES: '45', CHECKIN_LATE_MINUTES: '', QUEUE_WALK_IN_EVERY: 'abc', NO_SHOW_LIMIT: '-1' };
    const r = queueRules({ get: (k) => env[k] });
    expect(r).toMatchObject({ checkinEarlyMinutes: 45, checkinLateMinutes: 15, walkInEvery: 3, noShowLimit: 3 });
    expect(queueRules({ get: () => undefined })).toEqual(DEFAULT_RULES);
  });

  it('3 lần không đến trong 30 ngày thì khóa 14 ngày tính từ lần gần nhất', () => {
    const s = noShowStanding([day('2026-11-01'), day('2026-10-20'), day('2026-10-10')], day('2026-11-07'), DEFAULT_RULES);
    expect(s.recentNoShows).toBe(3);
    expect(s.lockedUntil?.toISOString().slice(0, 10)).toBe('2026-11-15');
  });

  it('hết hạn khóa thì đặt lại được; 3 lần cách nhau quá 30 ngày thì không khóa', () => {
    const dates = [day('2026-11-01'), day('2026-10-20'), day('2026-10-10')];
    expect(noShowStanding(dates, day('2026-11-16'), DEFAULT_RULES).lockedUntil).toBeNull();
    const spread = noShowStanding([day('2026-11-05'), day('2026-10-20'), day('2026-10-01')], day('2026-11-07'), DEFAULT_RULES);
    expect(spread).toEqual({ recentNoShows: 2, lockedUntil: null });
  });
});
