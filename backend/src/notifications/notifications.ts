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
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Global,
  HttpCode,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AllowPendingPassword, CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { vnDateString, vnTime } from '../common/time.js';
import type { NotificationType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { queueRules } from '../queue/queue-rules.js';
import { ticketLabel } from '../queue/queue-order.js';
import { RealtimeService } from '../realtime/realtime.js';

const NOTIFICATION_TYPES: NotificationType[] = ['CALLED', 'RESULTS_READY', 'VISIT_DONE', 'APPOINTMENT_REMINDER'];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Nhắc trước một ngày: chỉ gửi nếu còn hơn chừng này trước giờ hẹn (gửi trễ quá thì bỏ, đã có nhắc trước một giờ) */
const DAY_REMINDER_CUTOFF = 2 * HOUR;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  visitId?: string;
  appointmentId?: string;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId: string;
}

interface PushTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Gọi API Expo Push (miễn phí, không cần tài khoản; có EXPO_ACCESS_TOKEN thì gửi kèm). */
@Injectable()
export class ExpoPushClient {
  endpoint: string;
  private readonly accessToken?: string;

  constructor(config: ConfigService) {
    this.endpoint = String(config.get('EXPO_PUSH_URL') ?? '').trim() || EXPO_PUSH_URL;
    this.accessToken = String(config.get('EXPO_ACCESS_TOKEN') ?? '').trim() || undefined;
  }

  /** Trả về kết quả theo đúng thứ tự tin gửi đi (Expo nhận tối đa 100 tin mỗi lần). */
  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(messages.slice(i, i + 100)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Expo Push trả về ${res.status}`);
      const json = (await res.json()) as { data?: PushTicket[] };
      tickets.push(...(json.data ?? []));
    }
    return tickets;
  }
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
  async markRead(user: AuthUser, dto: ReadDto) {
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

const doctorLabel = (d: { title: string | null; user: { fullName: string } }) => `bác sĩ ${d.user.fullName}`;

/** "ngày mai" / "hôm nay" / "dd/MM" của giờ hẹn so với lúc gửi (theo giờ Việt Nam). */
export function dayWord(start: Date, now: Date) {
  const day = vnDateString(start);
  if (day === vnDateString(now)) return 'hôm nay';
  if (day === vnDateString(new Date(now.getTime() + 24 * HOUR))) return 'ngày mai';
  const [, m, d] = day.split('-');
  return `ngày ${d}/${m}`;
}

/**
 * Nhắc lịch hẹn (chạy mỗi REMINDER_SWEEP_SECONDS, mặc định 60 giây; 0 = tắt):
 *  - trước một ngày: khi còn ≤ 24 giờ (và > 2 giờ), chỉ với lịch đặt trước đó hơn 24 giờ;
 *  - trước một giờ: khi còn ≤ 60 phút, chỉ với lịch đặt trước đó hơn 60 phút.
 * Mỗi lần nhắc được đánh dấu trên lịch hẹn trước khi gửi nên không gửi trùng.
 */
@Injectable()
export class AppointmentReminder implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(AppointmentReminder.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const raw = String(this.config.get('REMINDER_SWEEP_SECONDS') ?? '').trim();
    const seconds = raw === '' ? 60 : Number(raw);
    if (!(seconds > 0)) return;
    const run = () =>
      this.sweep()
        .then((n) => (n ? this.log.log(`Đã gửi ${n} nhắc lịch`) : undefined))
        .catch((e: unknown) => this.log.error(`Nhắc lịch lỗi: ${String(e)}`));
    void run();
    this.timer = setInterval(run, seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()) {
    const { checkinEarlyMinutes, checkinLateMinutes } = queueRules(this.config);
    let sent = 0;
    for (const kind of ['day', 'hour'] as const) {
      const lead = kind === 'day' ? 24 * HOUR : HOUR;
      const due = await this.prisma.appointment.findMany({
        where: {
          status: { in: ['PENDING', 'CONFIRMED'] },
          visit: { is: null },
          ...(kind === 'day' ? { remindedDayAt: null } : { remindedHourAt: null }),
          schedule: { startTime: { lte: new Date(now.getTime() + lead), gt: new Date(now.getTime() + (kind === 'day' ? DAY_REMINDER_CUTOFF : 0)) } },
        },
        select: {
          id: true,
          createdAt: true,
          patient: { select: { userId: true } },
          schedule: { select: { startTime: true, doctor: { select: { title: true, room: true, user: { select: { fullName: true } } } } } },
        },
      });
      for (const a of due) {
        const start = a.schedule.startTime;
        // Đặt sát giờ thì không nhắc mốc này
        if (start.getTime() - a.createdAt.getTime() < lead) continue;
        // Đánh dấu trước, chỉ gửi nếu chưa có tiến trình nào đánh dấu
        const claimed = await this.prisma.appointment.updateMany({
          where: { id: a.id, ...(kind === 'day' ? { remindedDayAt: null } : { remindedHourAt: null }) },
          data: kind === 'day' ? { remindedDayAt: now } : { remindedHourAt: now },
        });
        if (claimed.count === 0 || !a.patient.userId) continue;
        const d = a.schedule.doctor;
        const from = vnTime(new Date(start.getTime() - checkinEarlyMinutes * MINUTE));
        const to = vnTime(new Date(start.getTime() + checkinLateMinutes * MINUTE));
        const minutes = Math.max(1, Math.round((start.getTime() - now.getTime()) / MINUTE));
        await this.notifications.notify(a.patient.userId, {
          type: 'APPOINTMENT_REMINDER',
          title: kind === 'day' ? `Nhắc lịch khám ${dayWord(start, now)} lúc ${vnTime(start)}` : `Còn ${minutes} phút nữa tới giờ khám`,
          body:
            `${vnTime(start)} với ${doctorLabel(d)}${d.room ? ` (${d.room})` : ''}. ` +
            `Đến quầy quét mã QR để check-in từ ${from} đến ${to}; quá giờ lịch hẹn sẽ bị hủy.`,
          url: '/appointments',
          appointmentId: a.id,
        });
        sent++;
      }
    }
    return sent;
  }
}

class ListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

class ReadDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) ids?: string[];
  @IsOptional() @IsString() visitId?: string;
  @IsOptional() @IsBoolean() all?: boolean;
  /** Chỉ đánh dấu các loại này (vd. mở phiếu số thì đánh dấu tin gọi số, không đụng tin "có kết quả") */
  @IsOptional() @IsArray() @IsIn(NOTIFICATION_TYPES, { each: true }) types?: NotificationType[];
}

class PushTokenDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/, { message: 'Token thông báo không hợp lệ' })
  token: string;
  @IsIn(['ios', 'android']) platform: 'ios' | 'android';
}

class RemoveTokenDto {
  @IsString() @MaxLength(200) token: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Roles('PATIENT')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: ListQuery) {
    return this.service.mine(user, q.limit);
  }

  @Roles('PATIENT')
  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Body() dto: ReadDto) {
    return this.service.markRead(user, dto);
  }

  @Roles('PATIENT')
  @Post('push-token')
  @HttpCode(200)
  register(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.service.registerToken(user, dto);
  }

  @AllowPendingPassword()
  @Post('push-token/remove')
  @HttpCode(200)
  remove(@CurrentUser() user: AuthUser, @Body() dto: RemoveTokenDto) {
    return this.service.removeToken(user, dto.token);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [ExpoPushClient, NotificationsService, AppointmentReminder],
  exports: [NotificationsService],
})
export class NotificationsModule {}
