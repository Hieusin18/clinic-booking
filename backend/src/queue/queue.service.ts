import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { todayVN, vnTime } from '../common/time.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CheckinMethod, VisitSource } from '../generated/prisma/enums.js';
import { queueTickets } from '../metrics/metrics.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentStreak, isDue, pickNext, predictOrder, ticketLabel, type CallRuleName, type Predicted, type QueueEntry } from './queue-order.js';
import { queueRules, type QueueRules } from './queue-rules.js';

export interface IssueTicketInput {
  patientId: string;
  doctorId: string;
  source: VisitSource;
  checkinMethod: CheckinMethod;
  reason?: string | null;
  appointmentId?: string;
  appointmentAt?: Date;
  checkinOverride?: boolean;
}

/** Thông tin một phiếu khám trong hàng đợi (kèm dị ứng để bác sĩ thấy ngay). */
export const visitView = {
  id: true,
  date: true,
  queueNumber: true,
  source: true,
  checkinMethod: true,
  status: true,
  reason: true,
  appointmentId: true,
  appointmentAt: true,
  checkinOverride: true,
  calledAt: true,
  callRule: true,
  createdAt: true,
  patient: { select: { id: true, fullName: true, phone: true, dateOfBirth: true, gender: true, allergies: true } },
  doctor: { select: { id: true, title: true, user: { select: { fullName: true } }, specialty: { select: { id: true, name: true } } } },
} satisfies Prisma.VisitSelect;

export type QueueVisit = Prisma.VisitGetPayload<{ select: typeof visitView }>;

/** Phiếu khám kèm dự đoán thứ tự gọi (chỉ với người đang chờ). */
export type ForecastVisit = QueueVisit & { predictedOrder: number | null; estimatedCallAt: Date | null; due: boolean };

/** Mã lỗi để web/app phân biệt (vd. đề nghị lễ tân check-in ngoài khung giờ, hoặc mở màn chọn bác sĩ). */
export type QueueErrorCode = 'CHECKIN_TOO_EARLY' | 'CHECKIN_TOO_LATE' | 'NEEDS_DOCTOR';

export function conflictWithCode(code: QueueErrorCode, message: string, extra: Record<string, unknown> = {}) {
  return new ConflictException({ statusCode: 409, error: 'Conflict', code, message, ...extra });
}

const ACTIVE = ['PENDING', 'CONFIRMED'] as const;
const MINUTE = 60_000;
type Tx = Prisma.TransactionClient;

@Injectable()
export class QueueService {
  readonly rules: QueueRules;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.rules = queueRules(config);
  }

  /**
   * Cấp số thứ tự trong dãy của nguồn đến (A = đặt lịch, B = vãng lai). Khóa advisory theo
   * (bác sĩ, ngày) để các yêu cầu cấp số cho cùng bác sĩ chạy lần lượt: đọc số lớn nhất rồi +1
   * không bị trùng. Ràng buộc unique (doctorId, date, source, queueNumber) là lớp bảo vệ thứ hai.
   */
  async issueTicket(input: IssueTicketInput) {
    const date = todayVN();
    const doctor = await this.prisma.doctor.findUnique({ where: { id: input.doctorId }, include: { user: true } });
    if (!doctor || !doctor.user.isActive) throw new NotFoundException('Không tìm thấy bác sĩ');

    try {
      const visit = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${input.doctorId}:${date.toISOString()}`}))`;

        // Mỗi bệnh nhân chỉ giữ một số đang chờ cho mỗi chuyên khoa trong ngày
        const waiting = await tx.visit.findFirst({
          where: { patientId: input.patientId, date, status: 'WAITING', doctor: { specialtyId: doctor.specialtyId } },
        });
        if (waiting) throw new ConflictException(`Bệnh nhân đang giữ số ${ticketLabel(waiting)} cho chuyên khoa này`);

        const last = await tx.visit.aggregate({
          where: { doctorId: input.doctorId, date, source: input.source },
          _max: { queueNumber: true },
        });
        return tx.visit.create({
          data: {
            patientId: input.patientId,
            doctorId: input.doctorId,
            date,
            queueNumber: (last._max.queueNumber ?? 0) + 1,
            source: input.source,
            checkinMethod: input.checkinMethod,
            reason: input.reason,
            appointmentId: input.appointmentId,
            appointmentAt: input.appointmentAt,
            checkinOverride: input.checkinOverride ?? false,
          },
          select: visitView,
        });
      });
      queueTickets.inc({ source: input.source });
      return visit;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Lịch hẹn này đã được check-in');
      }
      throw e;
    }
  }

  /** Khung giờ được check-in một lịch hẹn: từ giờ hẹn − CHECKIN_EARLY đến giờ hẹn + CHECKIN_LATE. */
  checkinWindow(start: Date) {
    return {
      opens: new Date(start.getTime() - this.rules.checkinEarlyMinutes * MINUTE),
      closes: new Date(start.getTime() + this.rules.checkinLateMinutes * MINUTE),
    };
  }

  lateMessage(start: Date) {
    return `Đến trễ quá ${this.rules.checkinLateMinutes} phút so với giờ hẹn ${vnTime(start)} nên lịch hẹn đã hết hiệu lực. Vui lòng lấy số thường.`;
  }

  /**
   * Check-in một lịch hẹn của hôm nay (lễ tân bấm hoặc bệnh nhân quét QR).
   * Ngoài khung giờ thì từ chối; đến trễ thì lịch hẹn thành "không đến".
   * Lễ tân được check-in ngoài khung giờ (`override`), kể cả lịch đã bị tính là không đến.
   */
  async checkIn(
    appointmentId: string,
    method: CheckinMethod,
    opts: { expectedPatientId?: string; override?: boolean; now?: Date } = {},
  ) {
    const now = opts.now ?? new Date();
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { schedule: true, visit: true },
    });
    if (!appt || (opts.expectedPatientId && appt.patientId !== opts.expectedPatientId)) {
      throw new NotFoundException('Không tìm thấy lịch hẹn');
    }
    if (appt.visit) throw new ConflictException(`Lịch hẹn đã được check-in, số thứ tự ${ticketLabel(appt.visit)}`);
    if (appt.schedule.date.getTime() !== todayVN(now).getTime()) {
      throw new ConflictException('Lịch hẹn không phải hôm nay');
    }
    const start = appt.schedule.startTime;
    const { opens, closes } = this.checkinWindow(start);
    // Giờ hẹn và khung check-in gửi kèm lỗi để màn hình lễ tân tự diễn đạt
    const times = { appointmentAt: start, opensAt: opens, closesAt: closes };
    if (appt.status === 'NO_SHOW' && !opts.override) throw conflictWithCode('CHECKIN_TOO_LATE', this.lateMessage(start), times);
    if (!['PENDING', 'CONFIRMED', 'NO_SHOW'].includes(appt.status)) throw new ConflictException('Lịch hẹn đã bị hủy hoặc đã xử lý');

    const outside = now < opens || now > closes;
    if (outside && !opts.override) {
      if (now < opens) {
        throw conflictWithCode(
          'CHECKIN_TOO_EARLY',
          `Lịch hẹn lúc ${vnTime(start)} mở check-in từ ${vnTime(opens)}. Nếu cần khám sớm, vui lòng liên hệ quầy lễ tân.`,
          times,
        );
      }
      await this.prisma.appointment.updateMany({ where: { id: appt.id, status: { in: [...ACTIVE] } }, data: { status: 'NO_SHOW' } });
      throw conflictWithCode('CHECKIN_TOO_LATE', this.lateMessage(start), times);
    }

    const visit = await this.issueTicket({
      patientId: appt.patientId,
      doctorId: appt.schedule.doctorId,
      source: 'ONLINE',
      checkinMethod: method,
      reason: appt.reason,
      appointmentId: appt.id,
      appointmentAt: start,
      checkinOverride: outside || appt.status === 'NO_SHOW',
    });
    if (appt.status === 'NO_SHOW') {
      await this.prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CONFIRMED' } });
    }
    return visit;
  }

  /** Hàng đợi hôm nay; lọc theo bác sĩ nếu có. Người đang chờ kèm thứ tự gọi dự kiến. */
  async today(doctorId?: string, now = new Date()): Promise<ForecastVisit[]> {
    const visits = await this.prisma.visit.findMany({
      where: { date: todayVN(now), ...(doctorId ? { doctorId } : {}) },
      orderBy: [{ doctorId: 'asc' }, { createdAt: 'asc' }],
      select: visitView,
    });
    const predicted = new Map<string, Predicted<QueueVisit>>();
    for (const id of new Set(visits.map((v) => v.doctor.id))) {
      for (const p of this.forecast(visits.filter((v) => v.doctor.id === id), now).predicted) predicted.set(p.entry.id, p);
    }
    return visits.map((v) => ({
      ...v,
      predictedOrder: predicted.get(v.id)?.order ?? null,
      estimatedCallAt: predicted.get(v.id)?.estimatedAt ?? null,
      due: v.status === 'WAITING' && isDue(v, now, this.rules),
    }));
  }

  /** Bác sĩ gọi số tiếp theo theo thứ tự ưu tiên (xem queue-order.ts). */
  callNext(doctorId: string, now = new Date()) {
    return this.call(doctorId, now, async (tx, date) => {
      const waiting = await tx.visit.findMany({
        where: { doctorId, date, status: 'WAITING' },
        select: { id: true, source: true, queueNumber: true, createdAt: true, appointmentAt: true },
      });
      const pick = pickNext(waiting, await this.streak(tx, doctorId, date), now, this.rules);
      if (!pick) throw new NotFoundException('Không còn bệnh nhân nào đang chờ');
      return { id: pick.entry.id, rule: pick.rule };
    });
  }

  /** Bác sĩ chọn đích danh một người đang chờ (người già yếu, trẻ sốt cao, xem lại kết quả…). */
  callVisit(doctorId: string, visitId: string, now = new Date()) {
    return this.call(doctorId, now, async (tx, date) => {
      const visit = await tx.visit.findUnique({ where: { id: visitId } });
      if (!visit || visit.doctorId !== doctorId || visit.date.getTime() !== date.getTime()) {
        throw new NotFoundException('Không tìm thấy phiếu khám');
      }
      if (visit.status !== 'WAITING') throw new ConflictException(`Số ${ticketLabel(visit)} không còn trong hàng chờ`);
      return { id: visit.id, rule: 'MANUAL' as const };
    });
  }

  private call(doctorId: string, now: Date, choose: (tx: Tx, date: Date) => Promise<{ id: string; rule: CallRuleName }>) {
    const date = todayVN(now);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`call:${doctorId}:${date.toISOString()}`}))`;
      const current = await tx.visit.findFirst({ where: { doctorId, date, status: 'IN_PROGRESS' } });
      if (current) throw new ConflictException(`Bạn đang khám số ${ticketLabel(current)}, hãy hoàn tất trước khi gọi tiếp`);
      const { id, rule } = await choose(tx, date);
      return tx.visit.update({ where: { id }, data: { status: 'IN_PROGRESS', calledAt: now, callRule: rule }, select: visitView });
    });
  }

  /** Số lượt liên tiếp gần nhất gọi người đặt lịch đến giờ hẹn. */
  private async streak(tx: Tx, doctorId: string, date: Date) {
    const recent = await tx.visit.findMany({
      where: { doctorId, date, calledAt: { not: null } },
      orderBy: { calledAt: 'desc' },
      take: 50,
      select: { callRule: true },
    });
    return currentStreak(recent.map((r) => r.callRule));
  }

  /** Dự đoán thứ tự gọi từ toàn bộ phiếu trong ngày của một bác sĩ. */
  private forecast<T extends QueueEntry & { status: string; calledAt: Date | null; callRule: CallRuleName | null }>(visits: T[], now: Date) {
    const waiting = visits.filter((v) => v.status === 'WAITING');
    const current = visits.find((v) => v.status === 'IN_PROGRESS') ?? null;
    const recent = visits
      .filter((v) => v.calledAt)
      .sort((a, b) => b.calledAt!.getTime() - a.calledAt!.getTime())
      .map((v) => v.callRule);
    const busyUntil = current ? new Date((current.calledAt ?? now).getTime() + this.rules.avgExamMinutes * MINUTE) : undefined;
    return { predicted: predictOrder(waiting, currentStreak(recent), now, this.rules, busyUntil), current };
  }

  /** Đánh dấu bệnh nhân bỏ về (không có mặt khi gọi số). */
  async markLeft(visitId: string, doctorId?: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
    if (!visit || (doctorId && visit.doctorId !== doctorId)) throw new NotFoundException('Không tìm thấy phiếu khám');
    const { count } = await this.prisma.visit.updateMany({
      where: { id: visitId, status: { in: ['WAITING', 'IN_PROGRESS'] } },
      data: { status: 'LEFT' },
    });
    if (count === 0) throw new ConflictException('Phiếu khám đã kết thúc');
    if (visit.appointmentId) {
      await this.prisma.appointment.update({ where: { id: visit.appointmentId }, data: { status: 'NO_SHOW' } });
    }
    return this.prisma.visit.findUniqueOrThrow({ where: { id: visitId }, select: visitView });
  }

  /**
   * Cho màn hình "Số thứ tự của tôi": số người được gọi trước, giờ dự kiến được gọi
   * và số đang khám. Tính bằng đúng quy tắc gọi số nên khớp với thực tế.
   */
  async position(visitId: string, patientId?: string, now = new Date()) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId }, select: visitView });
    if (!visit || (patientId && visit.patient.id !== patientId)) throw new NotFoundException('Không tìm thấy phiếu khám');

    const sameDay = await this.prisma.visit.findMany({
      where: { doctorId: visit.doctor.id, date: visit.date, status: { in: ['WAITING', 'IN_PROGRESS'] } },
      select: { id: true, source: true, queueNumber: true, createdAt: true, appointmentAt: true, status: true, calledAt: true, callRule: true },
    });
    const called = await this.prisma.visit.findMany({
      where: { doctorId: visit.doctor.id, date: visit.date, calledAt: { not: null }, status: { notIn: ['WAITING', 'IN_PROGRESS'] } },
      orderBy: { calledAt: 'desc' },
      take: 50,
      select: { id: true, source: true, queueNumber: true, createdAt: true, appointmentAt: true, status: true, calledAt: true, callRule: true },
    });
    const { predicted, current } = this.forecast([...sameDay, ...called], now);
    const mine = predicted.find((p) => p.entry.id === visit.id);
    return {
      visit,
      peopleAhead: mine?.order ?? 0,
      estimatedCallAt: mine?.estimatedAt ?? null,
      /** Người đặt lịch đã đến giờ hẹn (được ưu tiên ngay) */
      due: visit.status === 'WAITING' && isDue(visit, now, this.rules),
      current: current ? { queueNumber: current.queueNumber, source: current.source } : null,
    };
  }

  async doctorIdOf(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new ForbiddenException('Tài khoản không gắn với bác sĩ nào');
    return doctor.id;
  }
}
