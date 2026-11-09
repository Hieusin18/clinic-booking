import { describe, expect, it } from 'vitest';
import { reconnectWithNewToken, socketTarget } from './realtime';

describe('socketTarget', () => {
  it('API tương đối: WebSocket đi cùng địa chỉ trang, dưới /api', () => {
    expect(socketTarget('/api', 'http://113.23.97.140:8088')).toEqual({ url: 'http://113.23.97.140:8088', path: '/api/socket.io' });
  });
  it('API tuyệt đối', () => {
    expect(socketTarget('http://localhost:3000/api/', 'http://localhost:5173')).toEqual({ url: 'http://localhost:3000', path: '/api/socket.io' });
  });
});

describe('reconnectWithNewToken', () => {
  const fake = () => {
    let onDisconnect: (reason: string) => void = () => undefined;
    const s = {
      auth: { token: 'cu' } as unknown,
      connects: 0,
      on: (_e: 'disconnect', fn: (reason: string) => void) => (onDisconnect = fn),
      connect() {
        s.connects++;
      },
      drop: (reason: string) => onDisconnect(reason),
    };
    return s;
  };

  it('máy chủ ngắt vì token cũ, máy này đã có token mới: nối lại bằng token mới', () => {
    const s = fake();
    let token: string | null = 'cu';
    reconnectWithNewToken(s, 'cu', () => token);
    token = 'moi';
    s.drop('io server disconnect');
    expect(s.auth).toEqual({ token: 'moi' });
    expect(s.connects).toBe(1);
    // Bị ngắt tiếp với cùng token thì thôi (không lặp vô hạn)
    s.drop('io server disconnect');
    expect(s.connects).toBe(1);
  });

  it('không có token mới, hoặc mất mạng (Socket.IO tự nối lại) thì không làm gì', () => {
    const s = fake();
    reconnectWithNewToken(s, 'cu', () => 'cu');
    s.drop('io server disconnect');
    s.drop('transport close');
    expect(s.connects).toBe(0);
  });
});
