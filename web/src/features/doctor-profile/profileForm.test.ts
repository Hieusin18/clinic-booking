import { describe, expect, it } from 'vitest';
import type { Doctor } from '../../lib/types';
import { avatarProblem, avatarUrl, toProfileForm, toProfilePayload, yearRange } from './profileForm';

const doctor = {
  id: 'd1',
  title: 'BSCKI',
  bio: null,
  practiceSince: 2012,
  experienceYears: 14,
  expertise: ['Đái tháo đường'],
  avatarVersion: null,
  specialty: { id: 's1', name: 'Nội tổng quát' },
  user: { id: 'u1', fullName: 'Trần Thị Bình', phone: '0910000002', email: null, isActive: true },
  career: [{ id: 'h1', fromYear: 2021, toYear: null, title: 'Phụ trách khoa Nội', place: 'Phòng khám' }],
} satisfies Doctor;

describe('form hồ sơ bác sĩ', () => {
  it('điền form từ hồ sơ: việc đang làm đánh dấu "Đến nay"', () => {
    expect(toProfileForm(doctor)).toEqual({
      bio: '',
      practiceSince: 2012,
      expertise: ['Đái tháo đường'],
      education: [],
      career: [{ fromYear: 2021, toYear: null, current: true, title: 'Phụ trách khoa Nội', place: 'Phòng khám' }],
    });
  });

  it('gửi lên: "Đến nay" thì không có năm kết thúc, bỏ dòng trống, cắt khoảng trắng', () => {
    expect(
      toProfilePayload({
        bio: '  Giới thiệu ',
        expertise: [' Tăng huyết áp ', ''],
        career: [
          { fromYear: 2021, toYear: 2023, current: true, title: ' Trưởng khoa ', place: 'Phòng khám' },
          { fromYear: 2012, toYear: 2021, current: false, title: 'Bác sĩ', place: 'Bệnh viện' },
          {},
        ],
      }),
    ).toEqual({
      bio: 'Giới thiệu',
      practiceSince: null,
      expertise: ['Tăng huyết áp'],
      education: [],
      career: [
        { fromYear: 2021, toYear: null, title: 'Trưởng khoa', place: 'Phòng khám' },
        { fromYear: 2012, toYear: 2021, title: 'Bác sĩ', place: 'Bệnh viện' },
      ],
    });
  });

  it('khoảng năm và địa chỉ ảnh', () => {
    expect(yearRange({ fromYear: 2018, toYear: null })).toBe('2018 – nay');
    expect(yearRange({ fromYear: 2011, toYear: 2018 })).toBe('2011 – 2018');
    expect(yearRange({ fromYear: 2015, toYear: 2015 })).toBe('2015');
    expect(avatarUrl(doctor)).toBeUndefined();
    expect(avatarUrl({ id: 'd1', avatarVersion: 5 })).toBe('/api/doctors/d1/avatar?v=5');
  });

  it('chỉ nhận ảnh JPG, PNG, WebP tối đa 2 MB', () => {
    expect(avatarProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(avatarProblem({ type: 'image/gif', size: 1000 })).toBe('Ảnh phải là JPG, PNG hoặc WebP');
    expect(avatarProblem({ type: 'image/jpeg', size: 3 * 1024 * 1024 })).toBe('Ảnh tối đa 2 MB');
  });
});
