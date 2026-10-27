import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { errorMessage } from './api';

const httpError = (data: unknown, status = 400) =>
  new AxiosError('lỗi', 'ERR', undefined, undefined, { data, status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } });

describe('errorMessage', () => {
  it('lấy message dạng chuỗi từ backend', () => {
    expect(errorMessage(httpError({ message: 'Số điện thoại đã được đăng ký' }, 409))).toBe('Số điện thoại đã được đăng ký');
  });
  it('gộp message dạng mảng (lỗi validate)', () => {
    expect(errorMessage(httpError({ message: ['A sai', 'B sai'] }))).toBe('A sai; B sai');
  });
  it('báo mất kết nối khi không có phản hồi', () => {
    expect(errorMessage(new AxiosError('Network Error'))).toBe('Không kết nối được máy chủ, vui lòng thử lại');
  });
});
