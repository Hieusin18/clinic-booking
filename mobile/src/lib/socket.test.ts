import { describe, expect, it } from 'vitest';
import { PATIENT_LIVE_KEYS, socketTarget } from './socket';

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
