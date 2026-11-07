import { formatTime } from './format';
import type { BookingStanding, QueuePosition, VisitStatus } from './types';

export const VISIT_STATUS: Record<VisitStatus, { label: string; tone: 'warning' | 'primary' | 'success' | 'neutral' }> = {
  WAITING: { label: 'Đang chờ', tone: 'warning' },
  IN_PROGRESS: { label: 'Mời vào khám', tone: 'primary' },
  AWAITING_RESULTS: { label: 'Đi làm cận lâm sàng', tone: 'primary' },
  DONE: { label: 'Đã khám xong', tone: 'success' },
  LEFT: { label: 'Đã bỏ lượt', tone: 'neutral' },
};

/**
 * Câu nhắc trên phiếu số. `note` giải thích vì sao con số có thể thay đổi:
 * người đặt lịch đến giờ hẹn được gọi trước, nên người vãng lai có thể bị lùi lượt.
 */
export function waitHint(
  p: Pick<QueuePosition, 'peopleAhead' | 'due' | 'estimatedCallAt'> & {
    visit: Pick<QueuePosition['visit'], 'status' | 'source' | 'appointmentAt' | 'resultMode' | 'resultsReadyAt'>;
  },
): {
  text: string;
  note?: string;
} {
  const { status, source, appointmentAt, resultMode, resultsReadyAt } = p.visit;
  if (status === 'IN_PROGRESS') return { text: 'Đến lượt bạn, mời vào phòng khám.' };
  if (status === 'AWAITING_RESULTS' && resultMode === 'ONLINE') {
    return {
      text: 'Làm xong cận lâm sàng là bạn có thể ra về.',
      note: 'Bác sĩ sẽ đọc kết quả, kết luận và kê đơn; bạn xem trong tab Lịch sử của app.',
    };
  }
  if (status === 'AWAITING_RESULTS') {
    return {
      text: 'Làm xong cận lâm sàng, mời bạn quay lại khu chờ và giữ nguyên số này.',
      note: 'Khi bác sĩ có kết quả, bạn được gọi vào trước mọi người để đọc kết quả.',
    };
  }
  if (status === 'WAITING' && resultsReadyAt) {
    return { text: 'Đã có kết quả cận lâm sàng. Bạn được gọi vào trước, vui lòng chú ý loa gọi.' };
  }
  if (status === 'DONE') return { text: 'Bạn đã khám xong. Xem đơn thuốc ở tab Lịch sử.' };
  if (status === 'LEFT') return { text: 'Lượt của bạn đã bị bỏ qua. Vui lòng liên hệ quầy lễ tân.' };
  if (p.peopleAhead === 0) return { text: 'Bạn là người tiếp theo, vui lòng chú ý loa gọi.' };

  const eta = p.estimatedCallAt ? ` Dự kiến được gọi khoảng ${formatTime(p.estimatedCallAt)}.` : '';
  if (source === 'ONLINE' && appointmentAt && !p.due) {
    return {
      text: `Bạn đến sớm hơn giờ hẹn ${formatTime(appointmentAt)}.${eta}`,
      note: 'Gần đến giờ hẹn bạn sẽ được ưu tiên gọi trước người không đặt lịch.',
    };
  }
  if (source === 'ONLINE') return { text: `Còn ${p.peopleAhead} người phía trước.${eta}` };
  return {
    text: `Còn khoảng ${p.peopleAhead} người phía trước.${eta}`,
    note: 'Người có lịch hẹn đến giờ sẽ được ưu tiên nên con số có thể thay đổi.',
  };
}

/** Lỗi backend báo cần chọn bác sĩ (quét QR khi chưa đặt lịch hoặc lịch hẹn đã hết hiệu lực). */
export const NEEDS_DOCTOR = 'Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ';

/** "dd/mm/yyyy" từ "YYYY-MM-DD" */
const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

/** Cảnh báo trước khi đặt lịch theo số lần không đến gần đây. `blocked` = không cho đặt online. */
export function standingNotice(s: BookingStanding | undefined): { blocked: boolean; text: string } | null {
  if (!s) return null;
  if (s.lockedUntil) {
    return {
      blocked: true,
      text: `Bạn đã không đến khám ${s.limit} lần trong ${s.windowDays} ngày nên tạm thời không đặt lịch online được đến hết ngày ${dmy(s.lockedUntil)}. Bạn vẫn có thể đến phòng khám lấy số trực tiếp.`,
    };
  }
  if (s.limit > 0 && s.recentNoShows === s.limit - 1) {
    return {
      blocked: false,
      text: `Bạn đã không đến ${s.recentNoShows} lần trong ${s.windowDays} ngày qua. Nếu không đến thêm 1 lần nữa, bạn sẽ tạm thời không đặt lịch online được. Hãy hủy lịch trong app nếu không đến được.`,
    };
  }
  return null;
}
