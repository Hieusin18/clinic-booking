import { describe, expect, it } from 'vitest';
import { PATIENT_LIVE_KEYS, reconnectWithNewToken, socketTarget } from './socket';

describe('socketTarget', () => {
  it('API tuyệt đối: nối thẳng tới máy chủ, đường dẫn nằm dưới /api', () => {
    expect(socketTarget('http://192.168.1.5:3000/api')).toEqual({ url: 'http://192.168.1.5:3000', path: '/api/socket.io' });
    expect(socketTarget('https://clinic.example.com/api/')).toEqual({ url: 'https://clinic.example.com', path: '/api/socket.io' });
  });

  it('API tương đối (bản web khi dev): đi qua cùng địa chỉ trang', () => {
    expect(socketTarget('/api', 'http://localhost:8081')).toEqual({ url: 'http://localhost:8081', path: '/api/socket.io' });
  });

  it('làm mới phiếu số, vị trí trong hàng và lịch sử khám', () => {
    expect(PATIENT_LIVE_KEYS).toContainEqual(['queue', 'mine']);
    expect(PATIENT_LIVE_KEYS).toContainEqual(['position']);
    expect(PATIENT_LIVE_KEYS).toContainEqual(['visits', 'mine']);
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

  it('vừa đổi mật khẩu (có token mới): nối lại bằng token mới, chỉ một lần', () => {
    const s = fake();
    let token = 'cu';
    reconnectWithNewToken(s, 'cu', () => token);
    token = 'moi';
    s.drop('io server disconnect');
    s.drop('io server disconnect');
    expect(s.auth).toEqual({ token: 'moi' });
    expect(s.connects).toBe(1);
  });

  it('bị đăng xuất ở máy khác (không có token mới) hoặc mất mạng thì không làm gì', () => {
    const s = fake();
    reconnectWithNewToken(s, 'cu', () => 'cu');
    s.drop('io server disconnect');
    s.drop('transport close');
    expect(s.connects).toBe(0);
  });
});
