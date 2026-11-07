import { describe, expect, it } from 'vitest';
import { presentLocally, reminderPlan, targetOf, timeAgo, unreadResults, type AppNotification } from './notify';
import type { Appointment } from './types';

const appt = (extra: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  status: 'PENDING',
  reason: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  schedule: {
    id: 's1',
    startTime: '2026-11-20T02:00:00.000Z', // 09:00 giờ Việt Nam
    endTime: '2026-11-20T02:30:00.000Z',
    doctor: { id: 'd1', title: 'BSCKI', user: { fullName: 'Trần Thị Bình' }, room: 'Phòng 2' },
  },
  patient: { id: 'p1', fullName: 'A', phone: '0900000000' },
  visit: null,
  checkinOpensAt: '2026-11-20T01:30:00.000Z',
  checkinClosesAt: '2026-11-20T02:15:00.000Z',
  ...extra,
});

const note = (extra: Partial<AppNotification>): AppNotification => ({
  id: 'n',
  type: 'VISIT_DONE',
  title: 't',
  body: 'b',
  url: null,
  visitId: null,
  appointmentId: null,
  readAt: null,
  createdAt: '2026-11-20T02:00:00.000Z',
  ...extra,
});

describe('thông báo trên app', () => {
  it('chỉ tự hiện thông báo khi máy không nhận được tin đẩy; nhắc hẹn đã đặt lịch sẵn thì không hiện lại', () => {
    expect(presentLocally('CALLED', 'local')).toBe(true);
    expect(presentLocally('APPOINTMENT_REMINDER', 'local')).toBe(false);
    expect(presentLocally('CALLED', 'remote')).toBe(false);
    expect(presentLocally('VISIT_DONE', 'off')).toBe(false);
  });

  it('chỉ mở màn hình trong app', () => {
    expect(targetOf({ url: '/visit/0b8e-12' })).toBe('/visit/0b8e-12');
    expect(targetOf({ url: 'https://lua-dao.example' })).toBeNull();
    expect(targetOf({ url: '//lua-dao.example' })).toBeNull();
    expect(targetOf(null)).toBeNull();
  });

  it('đặt nhắc hẹn trước một ngày và trước một giờ, kèm phòng và giờ check-in', () => {
    const plan = reminderPlan([appt()], new Date('2026-11-18T00:00:00Z'));
    expect(plan.map((r) => [r.id, r.at.toISOString()])).toEqual([
      ['a1:day', '2026-11-19T02:00:00.000Z'],
      ['a1:hour', '2026-11-20T01:00:00.000Z'],
    ]);
    expect(plan[0].title).toBe('Nhắc lịch khám ngày mai lúc 09:00');
    expect(plan[0].body).toBe('09:00 với bác sĩ Trần Thị Bình (Phòng 2). Quét mã QR ở quầy để check-in từ 08:30 đến 09:15.');
    expect(plan[1].url).toBe('/appointments');
  });

  it('bỏ mốc đã qua, lịch đặt sát giờ, lịch đã hủy hoặc đã check-in', () => {
    expect(reminderPlan([appt()], new Date('2026-11-19T12:00:00Z')).map((r) => r.id)).toEqual(['a1:hour']);
    expect(reminderPlan([appt({ createdAt: '2026-11-19T22:00:00.000Z' })], new Date('2026-11-19T22:00:00Z')).map((r) => r.id)).toEqual(['a1:hour']);
    expect(reminderPlan([appt({ status: 'CANCELLED' })], new Date('2026-11-18T00:00:00Z'))).toEqual([]);
    expect(reminderPlan([appt({ visit: { id: 'v', queueNumber: 1, source: 'ONLINE', status: 'WAITING' } })], new Date('2026-11-18T00:00:00Z'))).toEqual([]);
  });

  it('thời gian tương đối', () => {
    const now = new Date('2026-11-20T05:00:00Z');
    expect(timeAgo('2026-11-20T04:59:30Z', now)).toBe('Vừa xong');
    expect(timeAgo('2026-11-20T04:40:00Z', now)).toBe('20 phút trước');
    expect(timeAgo('2026-11-20T02:00:00Z', now)).toBe('3 giờ trước');
    expect(timeAgo('2026-11-18T02:00:00Z', now)).toBe('09:00 18/11');
  });

  it('đếm lượt khám có kết quả mới chưa xem', () => {
    const r = unreadResults([
      note({ visitId: 'v1' }),
      note({ visitId: 'v1' }),
      note({ visitId: 'v2', readAt: '2026-11-20T03:00:00Z' }),
      note({ type: 'CALLED', visitId: 'v3' }),
    ]);
    expect(r.count).toBe(1);
    expect([...r.visits]).toEqual(['v1']);
  });
});
