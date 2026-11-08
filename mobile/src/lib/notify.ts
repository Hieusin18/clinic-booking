/**
 * Logic thuần của thông báo trên app (không phụ thuộc React Native để test được):
 * kiểu dữ liệu hộp thư, chọn cách hiện thông báo và lịch nhắc hẹn đặt sẵn trên máy.
 */
import { formatTime } from './format';
import type { Appointment } from './types';

export type NotificationType = 'CALLED' | 'RESULTS_READY' | 'VISIT_DONE' | 'APPOINTMENT_REMINDER';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string | null;
  visitId: string | null;
  appointmentId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Inbox {
  items: AppNotification[];
  unread: number;
}

/**
 * Máy này nhận thông báo theo cách nào:
 *  - remote: đã đăng ký token Expo Push, server đẩy về cả khi app đã tắt;
 *  - local:  không đẩy được (Expo Go trên Android, chưa cấu hình EAS): app tự hiện thông báo khi nhận
 *            tin qua WebSocket và tự đặt lịch nhắc hẹn trên máy;
 *  - off:    người dùng không cho phép thông báo, hoặc bản web.
 */
export type PushMode = 'remote' | 'local' | 'off';

/** Tin mới qua WebSocket có cần app tự hiện thông báo trên máy không. */
export function presentLocally(type: NotificationType, mode: PushMode) {
  // Đã đẩy từ server thì không hiện trùng; nhắc hẹn ở chế độ local đã được đặt lịch sẵn trên máy
  return mode === 'local' && type !== 'APPOINTMENT_REMINDER';
}

/** Chỉ mở màn hình trong app (đường dẫn bắt đầu bằng "/"), không mở địa chỉ lạ trong dữ liệu thông báo. */
export function targetOf(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && /^\/[\w\-/]*$/.test(url) ? url : null;
}

export interface LocalReminder {
  /** Mã duy nhất để đặt lại không bị trùng: "<appointmentId>:day" / ":hour" */
  id: string;
  at: Date;
  title: string;
  body: string;
  url: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Lịch nhắc đặt trên máy (chế độ local), cùng mốc với server: trước một ngày và trước một giờ.
 * Bỏ mốc đã qua; lịch đặt sát giờ hơn mốc nhắc thì không nhắc mốc đó.
 */
export function reminderPlan(appointments: Appointment[], now = new Date()): LocalReminder[] {
  const plan: LocalReminder[] = [];
  for (const a of appointments) {
    if (a.status !== 'PENDING' && a.status !== 'CONFIRMED') continue;
    if (a.visit) continue;
    const start = new Date(a.schedule.startTime).getTime();
    const created = new Date(a.createdAt).getTime();
    const d = a.schedule.doctor;
    const where = `${formatTime(a.schedule.startTime)} với bác sĩ ${d.user.fullName}${d.room ? ` (${d.room})` : ''}.`;
    const checkin =
      a.checkinOpensAt && a.checkinClosesAt ? ` Quét mã QR ở quầy để check-in từ ${formatTime(a.checkinOpensAt)} đến ${formatTime(a.checkinClosesAt)}.` : '';
    const marks = [
      { kind: 'day', lead: 24 * HOUR, title: `Nhắc lịch khám ngày mai lúc ${formatTime(a.schedule.startTime)}` },
      { kind: 'hour', lead: HOUR, title: 'Còn 60 phút nữa tới giờ khám' },
    ];
    for (const m of marks) {
      const at = start - m.lead;
      if (at <= now.getTime() || start - created < m.lead) continue;
      plan.push({ id: `${a.id}:${m.kind}`, at: new Date(at), title: m.title, body: where + checkin, url: '/appointments' });
    }
  }
  return plan.sort((x, y) => x.at.getTime() - y.at.getTime());
}

/** "Vừa xong", "5 phút trước", "3 giờ trước", rồi ngày giờ. */
export function timeAgo(iso: string, now = new Date()) {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return 'Vừa xong';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút trước`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} giờ trước`;
  // Tự ghép "dd/MM" (định dạng ngày của Intl khác nhau giữa Hermes và Node)
  const [, m, d] = new Date(new Date(iso).getTime() + 7 * HOUR).toISOString().slice(0, 10).split('-');
  return `${formatTime(iso)} ${d}/${m}`;
}

/** Số thông báo "có kết quả / đã lưu bệnh án" chưa đọc, hiện trên tab Lịch sử; kèm các lượt khám có tin mới. */
export function unreadResults(items: AppNotification[]) {
  const visits = new Set(items.filter((n) => n.type === 'VISIT_DONE' && !n.readAt && n.visitId).map((n) => n.visitId as string));
  return { count: visits.size, visits };
}
