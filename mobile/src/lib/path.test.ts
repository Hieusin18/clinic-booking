import { describe, expect, it } from 'vitest';
import { currentPath } from './path';

describe('currentPath', () => {
  it('giữ đường dẫn, bỏ tham số đã nằm trong đường dẫn', () => {
    expect(currentPath('/book/abc', { doctorId: 'abc', day: '2' })).toBe('/book/abc?day=2');
    expect(currentPath('/appointments', {})).toBe('/appointments');
  });
});
