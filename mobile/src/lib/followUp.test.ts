import { describe, expect, it } from 'vitest';
import { bookWindowStart, daysUntil } from './followUp';

describe('hẹn tái khám', () => {
  it('số ngày đến hẹn theo giờ Việt Nam', () => {
    const now = new Date('2026-11-20T18:00:00Z'); // 01:00 ngày 21/11 giờ Việt Nam
    expect(daysUntil('2026-11-28T00:00:00.000Z', now)).toBe(7);
    expect(daysUntil('2026-11-21', now)).toBe(0);
    expect(daysUntil('2026-11-19', now)).toBe(-2);
  });
  it('cửa sổ 7 ngày của màn đặt lịch', () => {
    expect(bookWindowStart(0)).toBe(0);
    expect(bookWindowStart(6)).toBe(0);
    expect(bookWindowStart(14)).toBe(11);
  });
});
