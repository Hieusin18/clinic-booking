import { describe, expect, it } from 'vitest';
import { capacityNote, type DoctorCapacity } from './capacity';

const base: DoctorCapacity = { doctorId: 'd', hasShift: true, shiftEnd: '2026-11-21T04:30:00.000Z', shiftOver: false, waitingWalkIns: 2, remaining: 5, accepting: true };

describe('sức chứa khách vãng lai', () => {
  it('ghi chú cạnh tên bác sĩ', () => {
    expect(capacityNote(base)).toEqual({ text: 'còn nhận ~5 · hết ca 11:30', full: false });
    expect(capacityNote({ ...base, hasShift: false, shiftEnd: null, remaining: 0, accepting: false })).toEqual({ text: 'không có ca hôm nay', full: true });
    expect(capacityNote({ ...base, remaining: 0, accepting: false })).toEqual({ text: 'kín lịch đến 11:30', full: true });
    expect(capacityNote({ ...base, shiftOver: true, remaining: 0, accepting: false })?.text).toBe('đã hết ca (11:30)');
    expect(capacityNote(undefined)).toBeNull();
  });
});
