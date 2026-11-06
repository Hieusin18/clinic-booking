import { formatTime } from '../../lib/format';
import type { Visit, VisitStatus } from '../../lib/types';

export const VISIT_STATUS: Record<VisitStatus, { label: string; color: string }> = {
  WAITING: { label: 'Đang chờ', color: 'gold' },
  IN_PROGRESS: { label: 'Đang khám', color: 'processing' },
  DONE: { label: 'Đã khám', color: 'success' },
  LEFT: { label: 'Bỏ về', color: 'default' },
};

/** Nhãn nguồn đến của một lượt: giờ hẹn (và đã đến giờ chưa) với người đặt lịch, "Vãng lai" với người đến trực tiếp. */
export function arrivalTag(v: Pick<Visit, 'source' | 'appointmentAt' | 'status' | 'due'>): { label: string; color: string } {
  if (v.source === 'WALK_IN' || !v.appointmentAt) return { label: 'Vãng lai', color: 'default' };
  const at = `Hẹn ${formatTime(v.appointmentAt)}`;
  if (v.status !== 'WAITING') return { label: at, color: 'blue' };
  return v.due ? { label: `${at} · đến giờ`, color: 'green' } : { label: `${at} · đến sớm`, color: 'blue' };
}

/** Sắp xếp hàng đợi: đang khám, rồi người chờ theo thứ tự gọi dự kiến, rồi người đã xong (gọi gần nhất trước). */
export function byCallOrder(a: Visit, b: Visit) {
  const rank = (v: Visit) => (v.status === 'IN_PROGRESS' ? 0 : v.status === 'WAITING' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.status === 'WAITING') return (a.predictedOrder ?? 999) - (b.predictedOrder ?? 999);
  return (b.calledAt ?? b.createdAt).localeCompare(a.calledAt ?? a.createdAt);
}
