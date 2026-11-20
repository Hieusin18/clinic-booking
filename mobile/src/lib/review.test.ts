import { describe, expect, it } from 'vitest';
import { distributionBars, formatAverage, ratingText } from './review';

describe('đánh giá', () => {
  it('điểm trung bình dạng tiếng Việt', () => {
    expect(formatAverage(4.6)).toBe('4,6');
    expect(formatAverage(5)).toBe('5,0');
    expect(formatAverage(null)).toBeNull();
  });
  it('dòng tóm tắt', () => {
    expect(ratingText({ average: 4.5, count: 12 })).toBe('4,5 ★ · 12 đánh giá');
    expect(ratingText({ average: null, count: 0 })).toBe('Chưa có đánh giá');
    expect(ratingText(undefined)).toBe('Chưa có đánh giá');
  });
  it('thanh phân bố sao', () => {
    const bars = distributionBars({ '5': 3, '4': 1, '3': 0, '2': 0, '1': 0 }, 4);
    expect(bars[0]).toEqual({ stars: 5, n: 3, ratio: 0.75 });
    expect(bars.map((b) => b.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(distributionBars({}, 0)[0].ratio).toBe(0);
  });
});
