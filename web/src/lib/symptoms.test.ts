import { describe, expect, it } from 'vitest';
import { allSymptoms, suggestSpecialties } from './symptoms';
import type { Specialty } from './types';

const sp = (id: string, name: string, symptoms: string[]): Specialty => ({ id, name, description: null, symptoms });
const list = [sp('noi', 'Nội tổng quát', ['Sốt', 'Ho kéo dài', 'Đau bụng']), sp('tmh', 'Tai Mũi Họng', ['Đau họng', 'Ho', 'sốt']), sp('da', 'Da liễu', [])];

describe('gợi ý chuyên khoa theo triệu chứng', () => {
  it('gom triệu chứng của mọi khoa, bỏ trùng không phân biệt hoa thường', () => {
    expect(allSymptoms(list)).toEqual(['Sốt', 'Ho kéo dài', 'Đau bụng', 'Đau họng', 'Ho']);
  });

  it('khoa khớp nhiều triệu chứng hơn xếp trước; không chọn gì thì không gợi ý', () => {
    const r = suggestSpecialties(list, ['Sốt', 'Đau họng']);
    expect(r.map((x) => x.specialty.id)).toEqual(['tmh', 'noi']);
    expect(r[0].matched).toEqual(['Đau họng', 'sốt']);
    expect(suggestSpecialties(list, [])).toEqual([]);
    expect(suggestSpecialties(list, ['Mụn'])).toEqual([]);
  });
});
