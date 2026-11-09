/**
 * Cập nhật tức thì qua WebSocket (Socket.IO, đường dẫn /api/socket.io để đi chung Caddy và proxy với API).
 *
 * Kết nối phải kèm token đăng nhập (`auth: { token }`). Ai cũng vào phòng riêng của tài khoản mình (để cắt kết nối
 * khi phiên bị thu hồi); nhân viên (bác sĩ, lễ tân, admin) vào thêm phòng "staff". Sự kiện chỉ báo "có gì đổi", không mang dữ liệu bệnh án:
 * máy khách nhận xong thì gọi lại API như cũ (API vẫn kiểm tra quyền).
 *
 *  - queue:changed  {doctorId?}            → staff: hàng đợi hoặc lịch hẹn trong ngày vừa đổi
 *  - queue:called   {visitId, label, room, doctorName, doctorFullName, recall} → staff: loa ở màn hình quầy đọc số
 *  - visit:changed  {visitId, status}      → bệnh nhân: phiếu số của mình vừa đổi
 *  - visit:called   {visitId, label, room} → bệnh nhân: đến lượt mình
 *  - notification:new {id, type, title, body, url} → bệnh nhân: có thông báo mới (src/notifications/notifications.service.ts)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ticketLabel } from '../queue/utils/queue-order.util.js';
import { RealtimeGateway, STAFF_ROOM, userRoom } from './realtime.gateway.js';

/** Các dịch vụ khác gọi vào đây sau khi đổi dữ liệu; lỗi ở đây không làm hỏng thao tác chính. */
@Injectable()
export class RealtimeService {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  /** Phiên đăng nhập cũ của tài khoản vừa hết hiệu lực: ngắt kết nối realtime tương ứng. */
  disconnectUser(userId: string, keepVer?: number) {
    return this.gateway.disconnectUser(userId, keepVer).catch(() => undefined);
  }

  /** Gửi riêng cho một tài khoản (vd. thông báo mới của bệnh nhân). */
  toUser(userId: string, event: string, payload: object) {
    this.gateway.emit(userRoom(userId), event, payload);
  }

  /** Báo cho nhân viên rằng hàng đợi / lịch hẹn trong ngày vừa đổi (không gắn với một lượt khám cụ thể). */
  staffChanged(doctorId?: string) {
    this.gateway.emit(STAFF_ROOM, 'queue:changed', doctorId ? { doctorId } : {});
  }

  /** Một lượt khám vừa đổi trạng thái: báo nhân viên và chính bệnh nhân đó. */
  async visitChanged(visitId: string) {
    const v = await this.load(visitId);
    if (!v) return;
    this.gateway.emit(STAFF_ROOM, 'queue:changed', { doctorId: v.doctorId, visitId });
    if (v.patient.userId) this.gateway.emit(userRoom(v.patient.userId), 'visit:changed', { visitId, status: v.status });
  }

  /** Bác sĩ gọi (hoặc gọi lại) một số: màn hình quầy đọc loa, app của bệnh nhân báo đến lượt. */
  async called(visitId: string, recall = false) {
    const v = await this.load(visitId);
    if (!v) return;
    const label = ticketLabel(v);
    const doctorName = `${v.doctor.title ? `${v.doctor.title} ` : ''}${v.doctor.user.fullName}`;
    this.gateway.emit(STAFF_ROOM, 'queue:called', { visitId, label, room: v.doctor.room, doctorName, doctorFullName: v.doctor.user.fullName, recall });
    this.gateway.emit(STAFF_ROOM, 'queue:changed', { doctorId: v.doctorId, visitId });
    if (v.patient.userId) {
      this.gateway.emit(userRoom(v.patient.userId), 'visit:called', { visitId, label, room: v.doctor.room, recall });
      this.gateway.emit(userRoom(v.patient.userId), 'visit:changed', { visitId, status: v.status });
    }
  }

  private load(id: string) {
    return this.prisma.visit.findUnique({
      where: { id },
      select: {
        status: true,
        doctorId: true,
        source: true,
        queueNumber: true,
        patient: { select: { userId: true } },
        doctor: { select: { title: true, room: true, user: { select: { fullName: true } } } },
      },
    });
  }
}

/** Gửi sự kiện mà không chờ, không để lỗi lan ra thao tác chính. */
export function fireAndForget(p: Promise<unknown> | void) {
  if (p) p.catch(() => undefined);
}
