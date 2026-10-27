import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

const httpError = (data: unknown) =>
  new AxiosError('x', 'ERR', undefined, undefined, { data, status: 400, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } });

describe('errorMessage', () => {
  it('chuỗi', () => expect(errorMessage(httpError({ message: 'Khung giờ này vừa có người đặt' }))).toBe('Khung giờ này vừa có người đặt'));
  it('mảng', () => expect(errorMessage(httpError({ message: ['A', 'B'] }))).toBe('A\nB'));
  it('mất mạng', () => expect(errorMessage(new AxiosError('Network Error'))).toMatch(/Không kết nối được máy chủ/));
});
