import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { errorMessage, sessionRejected } from './api';

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

describe('sessionRejected', () => {
  it('máy chủ từ chối phiên (401, 404) thì đăng xuất', () => {
    expect(sessionRejected(httpError({ message: 'Phiên đăng nhập đã hết hạn' }, 401))).toBe(true);
    expect(sessionRejected(httpError({}, 404))).toBe(true);
  });
  it('mất mạng hoặc máy chủ đang khởi động lại thì giữ đăng nhập', () => {
    expect(sessionRejected(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(sessionRejected(httpError({}, 502))).toBe(false);
    expect(sessionRejected(new Error('khác'))).toBe(false);
  });
});
