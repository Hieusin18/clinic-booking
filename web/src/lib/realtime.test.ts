import { describe, expect, it } from 'vitest';
import { socketTarget } from './realtime';

describe('socketTarget', () => {
  it('API tương đối: WebSocket đi cùng địa chỉ trang, dưới /api', () => {
    expect(socketTarget('/api', 'http://113.23.97.140:8088')).toEqual({ url: 'http://113.23.97.140:8088', path: '/api/socket.io' });
  });
  it('API tuyệt đối', () => {
    expect(socketTarget('http://localhost:3000/api/', 'http://localhost:5173')).toEqual({ url: 'http://localhost:3000', path: '/api/socket.io' });
  });
});
