import type { VisitStatus } from './types';

export const VISIT_STATUS: Record<VisitStatus, { label: string; tone: 'warning' | 'primary' | 'success' | 'neutral' }> = {
  WAITING: { label: 'Đang chờ', tone: 'warning' },
  IN_PROGRESS: { label: 'Mời vào khám', tone: 'primary' },
  DONE: { label: 'Đã khám xong', tone: 'success' },
  LEFT: { label: 'Đã bỏ lượt', tone: 'neutral' },
};

/** Câu nhắc trên phiếu số theo số người phía trước. */
export function waitHint(status: VisitStatus, peopleAhead: number) {
  if (status === 'IN_PROGRESS') return 'Đến lượt bạn, mời vào phòng khám.';
  if (status === 'DONE') return 'Bạn đã khám xong. Xem đơn thuốc ở tab Lịch sử.';
  if (status === 'LEFT') return 'Lượt của bạn đã bị bỏ qua. Vui lòng liên hệ quầy lễ tân.';
  if (peopleAhead === 0) return 'Bạn là người tiếp theo, vui lòng chú ý loa gọi.';
  return `Còn ${peopleAhead} người phía trước.`;
}

/** Lỗi backend báo cần chọn bác sĩ (quét QR khi chưa đặt lịch). */
export const NEEDS_DOCTOR = 'Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ';
