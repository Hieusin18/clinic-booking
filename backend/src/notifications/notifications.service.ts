/**
 * Thông báo cho bệnh nhân: lưu vào hộp thư trong app, báo ngay qua WebSocket (`notification:new`)
 * và đẩy về điện thoại qua dịch vụ Expo Push nếu máy đã đăng ký token.
 *
 * Khi nào gửi:
 *  - CALLED                bác sĩ gọi (hoặc gọi lại) số của bệnh nhân
 *  - RESULTS_READY         có kết quả cận lâm sàng, mời quay lại phòng khám (chế độ quay lại)
 *  - VISIT_DONE            khám xong: kết luận, đơn thuốc, kết quả đã có trên app (chế độ nhận online)
 *  - APPOINTMENT_REMINDER  nhắc lịch hẹn trước một ngày và trước một giờ (AppointmentReminder bên dưới)
 *
 * Gửi thông báo không bao giờ làm hỏng thao tác chính: lỗi chỉ ghi log.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { type AuthUser } from '../auth/interfaces/auth-user.interface.js';
import type { NotificationType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ticketLabel } from '../queue/utils/queue-order.util.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { MarkReadDto } from './dto/mark-read.dto.js';
import { PushTokenDto } from './dto/push-token.dto.js';
import { ExpoPushClient } from './expo-push.client.js';

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  visitId?: string;
  appointmentId?: string;
}

const listView = { id: true, type: true, title: true, body: true, url: true, visitId: true, appointmentId: true, readAt: true, createdAt: true } as const;

@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: ExpoPushClient,
  ) {}

  /** Lưu thông báo, báo qua WebSocket rồi đẩy về các máy của người đó. */
  async notify(userId: string, n: NewNotification) {
    const row = await this.prisma.notification.create({ data: { userId, ...n }, select: listView });
    this.realtime.toUser(userId, 'notification:new', row);
    await this.pushTo(userId, row).catch((e: unknown) => this.log.warn(`Không đẩy được thông báo: ${String(e)}`));
    return row;
  }

  private async pushTo(userId: string, n: { id: string; type: NotificationType; title: string; body: string; url: string | null }) {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;
    const tickets = await this.push.send(
      tokens.map((t) => ({
        to: t.token,
        title: n.title,
        body: n.body,
        data: { url: n.url, notificationId: n.id, type: n.type },
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      })),
    );
    // Máy đã gỡ app hoặc tắt thông báo: bỏ token để lần sau không gửi nữa
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered').map((t) => t.token);
    if (dead.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
  }

  // ---- Các sự kiện của lượt khám ----

  private loadVisit(visitId: string) {
    return this.prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        source: true,
        queueNumber: true,
        resultMode: true,
        patient: { select: { userId: true } },
        doctor: { select: { title: true, room: true, user: { select: { fullName: true } } } },
        _count: { select: { labOrders: true } },
      },
    });
  }

  /** Bác sĩ gọi số: "Đến lượt bạn: số B01, mời vào Phòng 2". */
  async called(visitId: string, recall = false) {
    const v = await this.loadVisit(visitId);
    if (!v?.patient.userId) return;
    const label = ticketLabel(v);
    const where = v.doctor.room?.trim() || `phòng khám ${doctorLabel(v.doctor)}`;
    await this.notify(v.patient.userId, {
      type: 'CALLED',
      title: recall ? `Bác sĩ đang gọi lại số ${label}` : `Đến lượt bạn: số ${label}`,
      body: `Mời bạn vào ${where}.`,
      url: '/ticket',
      visitId,
    });
  }

  /** Có kết quả cận lâm sàng, bệnh nhân quay lại để bác sĩ đọc kết quả (được gọi trước). */
  async resultsReady(visitId: string) {
    const v = await this.loadVisit(visitId);
    if (!v?.patient.userId) return;
    await this.notify(v.patient.userId, {
      type: 'RESULTS_READY',
      title: 'Đã có kết quả cận lâm sàng',
      body: `Mời bạn quay lại ${v.doctor.room?.trim() || 'phòng khám'} để ${doctorLabel(v.doctor)} đọc kết quả. Bạn sẽ được gọi trước.`,
      url: '/ticket',
      visitId,
    });
  }

  /** Khám xong: bệnh án, đơn thuốc (và kết quả nếu nhận online) đã có trong app. */
  async visitDone(visitId: string) {
    const v = await this.loadVisit(visitId);
    if (!v?.patient.userId) return;
    const online = v.resultMode === 'ONLINE';
    await this.notify(v.patient.userId, {
      type: 'VISIT_DONE',
      title: online ? 'Đã có kết quả khám' : 'Đã lưu bệnh án lần khám',
      body: online
        ? `${doctorLabel(v.doctor)} đã gửi kết quả cận lâm sàng, kết luận và đơn thuốc. Bấm để xem.`
        : `Chẩn đoán${v._count.labOrders ? ', kết quả cận lâm sàng' : ''} và đơn thuốc của bạn đã có trong Lịch sử khám.`,
      url: `/visit/${visitId}`,
      visitId,
    });
  }

  // ---- Hộp thư ----

  async mine(user: AuthUser, limit = 30) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.sub }, orderBy: { createdAt: 'desc' }, take: limit, select: listView }),
      this.prisma.notification.count({ where: { userId: user.sub, readAt: null } }),
    ]);
    return { items, unread };
  }

  /** Đánh dấu đã đọc: theo danh sách id, theo lượt khám (mở chi tiết lần khám), hoặc tất cả; có thể lọc theo loại. */
  async markRead(user: AuthUser, dto: MarkReadDto) {
    if (!dto.all && !dto.ids?.length && !dto.visitId) throw new BadRequestException('Chọn thông báo cần đánh dấu đã đọc');
    await this.prisma.notification.updateMany({
      where: {
        userId: user.sub,
        readAt: null,
        ...(dto.all ? {} : dto.visitId ? { visitId: dto.visitId } : { id: { in: dto.ids } }),
        ...(dto.types?.length ? { type: { in: dto.types } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { unread: await this.prisma.notification.count({ where: { userId: user.sub, readAt: null } }) };
  }

  /** Máy vừa đăng nhập đăng ký token; máy dùng chung mà đổi tài khoản thì token chuyển sang tài khoản mới. */
  async registerToken(user: AuthUser, dto: PushTokenDto) {
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, userId: user.sub, platform: dto.platform },
      update: { userId: user.sub, platform: dto.platform },
    });
    return { ok: true };
  }

  /** Đăng xuất: máy này thôi nhận thông báo của tài khoản. */
  async removeToken(user: AuthUser, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId: user.sub } });
    return { ok: true };
  }
}

export const doctorLabel = (d: { title: string | null; user: { fullName: string } }) => `bác sĩ ${d.user.fullName}`;
