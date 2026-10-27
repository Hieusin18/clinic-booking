import { describe, expect, it } from 'vitest';
import { dayLabel, doctorName, formatDay, formatTime, ymd } from './format';

const now = new Date('2026-11-01T20:00:00Z'); // 03:00 sáng 2/11 giờ Việt Nam

describe('định dạng ngày giờ trên app', () => {
  it('giờ theo giờ Việt Nam', () => expect(formatTime('2026-11-02T01:30:00.000Z')).toBe('08:30'));
  it('cột ngày không lệch', () => expect(formatDay('2026-11-02T00:00:00.000Z')).toBe('02/11/2026'));
  it('ngày theo giờ Việt Nam, cộng ngày', () => {
    expect(ymd(0, now)).toBe('2026-11-02');
    expect(ymd(1, now)).toBe('2026-11-03');
  });
  it('nhãn ngày thân thiện', () => {
    expect(dayLabel(0, now)).toBe('Hôm nay');
    expect(dayLabel(1, now)).toBe('Ngày mai');
    expect(dayLabel(2, now)).toBe('T4 04/11');
  });
  it('tên bác sĩ kèm học vị', () => expect(doctorName({ title: 'BS', user: { fullName: 'An' } })).toBe('BS An'));
});
