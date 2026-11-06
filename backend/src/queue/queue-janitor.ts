import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { todayVN, vnTime } from '../common/time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from './queue.service.js';

const MINUTE = 60_000;

/**
 * Việc dọn hàng đợi chạy định kỳ (QUEUE_SWEEP_SECONDS, mặc định 5 phút; 0 = tắt):
 *  - lịch hẹn quá giờ hẹn + CHECKIN_LATE_MINUTES mà chưa check-in → "không đến";
 *  - sau QUEUE_DAY_END_HOUR (và mọi ngày đã qua), số còn đang chờ → "bỏ về".
 * Backend chỉ chạy một bản nên dùng setInterval là đủ.
 */
@Injectable()
export class QueueJanitor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueJanitor.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const raw = String(this.config.get('QUEUE_SWEEP_SECONDS') ?? '').trim();
    const seconds = raw === '' ? 300 : Number(raw);
    if (!(seconds > 0)) return;
    const run = () =>
      this.sweep()
        .then((r) => (r.noShow || r.left ? this.logger.log(`Không đến: ${r.noShow}, bỏ về: ${r.left}`) : undefined))
        .catch((e: unknown) => this.logger.error(`Dọn hàng đợi lỗi: ${String(e)}`));
    void run();
    this.timer = setInterval(run, seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()) {
    const { checkinLateMinutes, dayEndHour } = this.queue.rules;

    const noShow = await this.prisma.appointment.updateMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        visit: { is: null },
        schedule: { startTime: { lt: new Date(now.getTime() - checkinLateMinutes * MINUTE) } },
      },
      data: { status: 'NO_SHOW' },
    });

    const today = todayVN(now);
    const afterHours = Number(vnTime(now).slice(0, 2)) >= dayEndHour;
    const stale = await this.prisma.visit.findMany({
      where: { status: 'WAITING', date: afterHours ? { lte: today } : { lt: today } },
      select: { id: true, appointmentId: true },
    });
    if (stale.length > 0) {
      const appointmentIds = stale.map((v) => v.appointmentId).filter((id): id is string => !!id);
      await this.prisma.$transaction([
        this.prisma.visit.updateMany({ where: { id: { in: stale.map((v) => v.id) }, status: 'WAITING' }, data: { status: 'LEFT' } }),
        this.prisma.appointment.updateMany({
          where: { id: { in: appointmentIds }, status: { in: ['PENDING', 'CONFIRMED'] } },
          data: { status: 'NO_SHOW' },
        }),
      ]);
    }
    return { noShow: noShow.count, left: stale.length };
  }
}
