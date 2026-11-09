import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { vnDateString, vnTime } from '../common/utils/time.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { queueRules } from '../queue/utils/queue-rules.util.js';
import { NotificationsService, doctorLabel } from './notifications.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Nhắc trước một ngày: chỉ gửi nếu còn hơn chừng này trước giờ hẹn (gửi trễ quá thì bỏ, đã có nhắc trước một giờ) */
const DAY_REMINDER_CUTOFF = 2 * HOUR;

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
