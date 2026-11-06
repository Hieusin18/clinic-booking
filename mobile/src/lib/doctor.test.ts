import { describe, expect, it } from 'vitest';
import { availabilitySummary, avatarUri, currentPosition, experienceText, initial, isEmptyProfile, yearRange } from './doctor';
import type { Doctor } from './types';

const base: Doctor = {
  id: 'd1',
  title: 'BSCKI',
  bio: null,
  practiceSince: null,
  experienceYears: null,
  expertise: [],
  avatarVersion: null,
  specialty: { id: 's1', name: 'Nội tổng quát' },
  user: { fullName: 'Trần Thị Bình' },
};

describe('hồ sơ bác sĩ', () => {
  it('ảnh đại diện có số phiên bản; chưa có ảnh thì hiện chữ cái đầu của tên', () => {
    expect(avatarUri('http://x/api', base)).toBeNull();
    expect(avatarUri('http://x/api', { id: 'd1', avatarVersion: 9 })).toBe('http://x/api/doctors/d1/avatar?v=9');
    expect(initial('Trần Thị Bình')).toBe('B');
  });

  it('số năm kinh nghiệm', () => {
    expect(experienceText(base)).toBeNull();
    expect(experienceText({ experienceYears: 0 })).toBe('Mới hành nghề');
    expect(experienceText({ experienceYears: 15 })).toBe('15 năm kinh nghiệm');
  });

  it('khoảng năm và công việc hiện tại', () => {
    expect(yearRange({ fromYear: 2018, toYear: null })).toBe('2018 – nay');
    expect(yearRange({ fromYear: 2011, toYear: 2018 })).toBe('2011 – 2018');
    expect(yearRange({ fromYear: 2015, toYear: 2015 })).toBe('2015');
    const career = [
      { id: 'a', fromYear: 2021, toYear: null, title: 'Phụ trách khoa Nội', place: 'Phòng khám' },
      { id: 'b', fromYear: 2012, toYear: 2021, title: 'Bác sĩ', place: 'Bệnh viện' },
    ];
    expect(currentPosition({ career })).toBe('Phụ trách khoa Nội · Phòng khám');
    expect(currentPosition({ career: [career[1]] })).toBeNull();
  });

  it('hồ sơ trống và tóm tắt lịch trống', () => {
    expect(isEmptyProfile(base)).toBe(true);
    expect(isEmptyProfile({ ...base, expertise: ['Tăng huyết áp'] })).toBe(false);
    expect(availabilitySummary([{ date: '2026-11-07', free: 0 }, { date: '2026-11-08', free: 5 }])).toBe('Còn 5 chỗ trống trong 2 ngày tới');
    expect(availabilitySummary([{ date: '2026-11-07', free: 0 }])).toBe('Hết chỗ trống trong 1 ngày tới');
  });
});
