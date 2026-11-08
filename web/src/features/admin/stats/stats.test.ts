import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { change, fmt, fmtMinutes, labelEvery, niceTicks, presets, toCsv } from './stats';
import { sample } from './sample';

describe('tiện ích thống kê', () => {
  it('định dạng số kiểu Việt Nam', () => {
    expect(fmt(1234)).toBe('1.234');
    expect(fmt(7.5)).toBe('7,5');
    expect(fmtMinutes(null)).toBe('—');
    expect(fmtMinutes(12)).toBe('12 phút');
  });

  it('so với kỳ trước: số đếm theo %, tỷ lệ theo điểm %, thời gian theo phút; giảm thời gian chờ là tốt', () => {
    expect(change(110, 100, { kind: 'count' })).toEqual({ text: '+10%', up: true, better: true });
    expect(change(38.7, 27, { kind: 'percent' })).toEqual({ text: '+11,7 điểm %', up: true, better: true });
    expect(change(7.5, 10.6, { kind: 'minutes', lowerIsBetter: true })).toEqual({ text: '−3,1 phút', up: false, better: true });
    expect(change(5, 5, { kind: 'count' })).toMatchObject({ text: 'không đổi', better: null });
    expect(change(8.4, 8.1, { kind: 'minutes', neutral: true })).toEqual({ text: '+0,3 phút', up: true, better: null });
    expect(change(5, 0, { kind: 'count' })).toBeNull();
    expect(change(null, 3, { kind: 'minutes' })).toBeNull();
  });

  it('mốc trục tung tròn và nhãn trục hoành thưa', () => {
    expect(niceTicks(56)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(labelEvery(90, 12)).toBe(8);
    expect(labelEvery(7, 12)).toBe(1);
  });

  it('khoảng chọn nhanh tính tới hôm nay', () => {
    const p = presets(dayjs('2026-11-08'));
    expect(p.map((x) => x.label)).toEqual(['7 ngày qua', '30 ngày qua', '90 ngày qua', 'Tháng này', 'Tháng trước']);
    expect(p[1].value.map((d) => d.format('YYYY-MM-DD'))).toEqual(['2026-10-10', '2026-11-08']);
    expect(p[4].value.map((d) => d.format('YYYY-MM-DD'))).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('CSV có BOM, bao dấu phẩy trong tên', () => {
    const csv = toCsv(sample);
    expect(csv.startsWith('﻿Thống kê 01/11/2026 – 07/11/2026')).toBe(true);
    expect(csv).toContain('Lượt khám xong,1426,1508');
    expect(csv).toContain('07/11/2026,2,5,2');
    expect(csv).toContain('J02.9,"Viêm họng, cấp",21');
  });
});
