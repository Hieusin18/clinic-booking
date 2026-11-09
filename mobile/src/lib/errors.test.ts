import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { AppError, errorMessage, sessionRejected } from './errors';

const httpError = (data: unknown) =>
  new AxiosError('x', 'ERR', undefined, undefined, { data, status: 400, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } });

describe('errorMessage', () => {
  it('chuỗi', () => expect(errorMessage(httpError({ message: 'Khung giờ này vừa có người đặt' }))).toBe('Khung giờ này vừa có người đặt'));
  it('mảng', () => expect(errorMessage(httpError({ message: ['A', 'B'] }))).toBe('A\nB'));
  it('lỗi của app giữ nguyên thông báo', () => expect(errorMessage(new AppError('Ứng dụng dành cho bệnh nhân'))).toBe('Ứng dụng dành cho bệnh nhân'));
  it('lỗi lạ không lộ chi tiết kỹ thuật', () => expect(errorMessage(new Error('undefined is not a function'))).toBe('Đã có lỗi xảy ra, vui lòng thử lại'));
  it('mất mạng', () => expect(errorMessage(new AxiosError('Network Error'))).toMatch(/Không kết nối được máy chủ/));
});

describe('sessionRejected', () => {
  const status = (s: number) =>
    new AxiosError('x', 'ERR', undefined, undefined, { data: {}, status: s, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } });
  it('máy chủ từ chối phiên thì đăng xuất', () => expect(sessionRejected(status(401))).toBe(true));
  it('mất mạng / máy chủ lỗi tạm thời thì giữ đăng nhập', () => {
    expect(sessionRejected(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(sessionRejected(status(503))).toBe(false);
  });
});
