import { describe, expect, it } from 'vitest';
import { ageOf, dayLabel, dayMonth, dayParts, doctorName, formatDay, formatTime, ymd } from './format';

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
    expect(dayParts(0, now)).toEqual({ top: 'Nay', day: '02', month: '11' });
    expect(dayParts(1, now).top).toBe('Mai');
    expect(dayParts(2, now)).toEqual({ top: 'T4', day: '04', month: '11' });
    expect(dayMonth('2026-11-05T00:00:00.000Z')).toEqual({ dm: '05/11', year: '2026' });
  });
  it('tên bác sĩ kèm học vị', () => expect(doctorName({ title: 'BS', user: { fullName: 'An' } })).toBe('BS An'));
});

import { parseVnDate, toVnDateInput } from './format';

describe('nhập ngày sinh', () => {
  it('đổi DD/MM/YYYY sang YYYY-MM-DD', () => {
    expect(parseVnDate('5/3/1998')).toBe('1998-03-05');
    expect(parseVnDate('20/12/2001')).toBe('2001-12-20');
  });
  it('từ chối ngày không có thật, sai định dạng hoặc ở tương lai', () => {
    expect(parseVnDate('31/02/2000')).toBeNull();
    expect(parseVnDate('2000-01-01')).toBeNull();
    expect(parseVnDate('01/01/2999')).toBeNull();
  });
  it('hiện lại ngày sinh từ API vào ô nhập', () => expect(toVnDateInput('1998-03-05T00:00:00.000Z')).toBe('05/03/1998'));
});

describe('ageOf', () => {
  const now = new Date('2026-11-07T03:00:00Z');
  it('chưa tới sinh nhật năm nay thì chưa thêm tuổi', () => {
    expect(ageOf('1990-11-08T00:00:00.000Z', now)).toBe(35);
  });
  it('đúng ngày sinh nhật thì thêm tuổi', () => {
    expect(ageOf('1990-11-07', now)).toBe(36);
  });
});
