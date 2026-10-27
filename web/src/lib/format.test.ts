import { describe, expect, it } from 'vitest';
import { age, doctorName, formatDay, formatTime, todayYmd } from './format';

describe('định dạng ngày giờ', () => {
  it('hiển thị giờ theo giờ Việt Nam dù dữ liệu là UTC', () => {
    expect(formatTime('2026-11-02T01:30:00.000Z')).toBe('08:30');
  });
  it('cột ngày (@db.Date) không bị lệch sang ngày hôm trước', () => {
    expect(formatDay('2026-11-02T00:00:00.000Z')).toBe('02/11/2026');
  });
  it('ngày hôm nay theo giờ Việt Nam', () => {
    // 20:00 UTC ngày 1/11 = 03:00 sáng ngày 2/11 ở Việt Nam
    expect(todayYmd(new Date('2026-11-01T20:00:00Z'))).toBe('2026-11-02');
  });
  it('tính tuổi theo ngày sinh', () => {
    expect(age('1990-11-03T00:00:00.000Z', new Date('2026-11-02T00:00:00Z'))).toBe(35);
    expect(age('1990-11-02T00:00:00.000Z', new Date('2026-11-02T00:00:00Z'))).toBe(36);
  });
  it('ghép học vị với tên bác sĩ', () => {
    expect(doctorName({ title: 'ThS.BS', user: { fullName: 'Nguyễn An' } })).toBe('ThS.BS Nguyễn An');
    expect(doctorName({ title: null, user: { fullName: 'Nguyễn An' } })).toBe('Nguyễn An');
  });
});
