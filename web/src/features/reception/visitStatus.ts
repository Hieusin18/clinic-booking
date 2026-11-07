import { formatTime } from '../../lib/format';
import type { Visit, VisitStatus } from '../../lib/types';

export const VISIT_STATUS: Record<VisitStatus, { label: string; color: string }> = {
  WAITING: { label: 'Đang chờ', color: 'warning' },
  IN_PROGRESS: { label: 'Đang khám', color: 'processing' },
  AWAITING_RESULTS: { label: 'Đang làm CLS', color: 'purple' },
  DONE: { label: 'Đã khám', color: 'success' },
  LEFT: { label: 'Bỏ về', color: 'default' },
};

/** Nhãn nguồn đến của một lượt: giờ hẹn (và đã đến giờ chưa) với người đặt lịch, "Vãng lai" với người đến trực tiếp. */
export function arrivalTag(v: Pick<Visit, 'source' | 'appointmentAt' | 'status' | 'due' | 'resultsReadyAt'>): { label: string; color: string } {
  if (v.status === 'WAITING' && v.resultsReadyAt) return { label: 'Có kết quả CLS · gọi trước', color: 'success' };
  if (v.source === 'WALK_IN' || !v.appointmentAt) return { label: 'Vãng lai', color: 'default' };
  const at = `Hẹn ${formatTime(v.appointmentAt)}`;
  if (v.status !== 'WAITING') return { label: at, color: 'processing' };
  return v.due ? { label: `${at} · đến giờ`, color: 'success' } : { label: `${at} · đến sớm`, color: 'processing' };
}

/** Sắp xếp hàng đợi: đang khám, người chờ theo thứ tự gọi dự kiến, người đang làm cận lâm sàng, rồi người đã xong (gọi gần nhất trước). */
export function byCallOrder(a: Visit, b: Visit) {
  const rank = (v: Visit) => ({ IN_PROGRESS: 0, WAITING: 1, AWAITING_RESULTS: 2, DONE: 3, LEFT: 3 })[v.status];
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.status === 'WAITING') return (a.predictedOrder ?? 999) - (b.predictedOrder ?? 999);
  return (b.calledAt ?? b.createdAt).localeCompare(a.calledAt ?? a.createdAt);
}
