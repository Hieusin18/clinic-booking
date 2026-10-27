import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { todayVN } from '../common/time.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CheckinMethod, VisitSource } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface IssueTicketInput {
  patientId: string;
  doctorId: string;
  source: VisitSource;
  checkinMethod: CheckinMethod;
  reason?: string | null;
  appointmentId?: string;
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
  createdAt: true,
  patient: { select: { id: true, fullName: true, phone: true, dateOfBirth: true, gender: true, allergies: true } },
  doctor: { select: { id: true, title: true, user: { select: { fullName: true } }, specialty: { select: { id: true, name: true } } } },
} satisfies Prisma.VisitSelect;

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cấp số thứ tự. Khóa advisory theo (bác sĩ, ngày) để các yêu cầu cấp số cho cùng
   * bác sĩ chạy lần lượt: đọc số lớn nhất rồi +1 không bị trùng. Ràng buộc unique
   * (doctorId, date, queueNumber) trong CSDL là lớp bảo vệ thứ hai.
   */
  async issueTicket(input: IssueTicketInput) {
    const date = todayVN();
    const doctor = await this.prisma.doctor.findUnique({ where: { id: input.doctorId }, include: { user: true } });
    if (!doctor || !doctor.user.isActive) throw new NotFoundException('Không tìm thấy bác sĩ');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue:${input.doctorId}:${date.toISOString()}`}))`;

        // Mỗi bệnh nhân chỉ giữ một số đang chờ cho mỗi chuyên khoa trong ngày
        const waiting = await tx.visit.findFirst({
          where: { patientId: input.patientId, date, status: 'WAITING', doctor: { specialtyId: doctor.specialtyId } },
        });
        if (waiting) throw new ConflictException(`Bệnh nhân đang giữ số ${waiting.queueNumber} cho chuyên khoa này`);

        const last = await tx.visit.aggregate({ where: { doctorId: input.doctorId, date }, _max: { queueNumber: true } });
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
          },
          select: visitView,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Lịch hẹn này đã được check-in');
      }
      throw e;
    }
  }

  /** Check-in một lịch hẹn của hôm nay (lễ tân bấm hoặc bệnh nhân quét QR). */
  async checkIn(appointmentId: string, method: CheckinMethod, expectedPatientId?: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { schedule: true, visit: true },
    });
    if (!appt || (expectedPatientId && appt.patientId !== expectedPatientId)) {
      throw new NotFoundException('Không tìm thấy lịch hẹn');
    }
    if (appt.visit) throw new ConflictException(`Lịch hẹn đã được check-in, số thứ tự ${appt.visit.queueNumber}`);
    if (!['PENDING', 'CONFIRMED'].includes(appt.status)) throw new ConflictException('Lịch hẹn đã bị hủy hoặc đã xử lý');
    if (appt.schedule.date.getTime() !== todayVN().getTime()) {
      throw new ConflictException('Lịch hẹn không phải hôm nay');
    }
    return this.issueTicket({
      patientId: appt.patientId,
      doctorId: appt.schedule.doctorId,
      source: 'ONLINE',
      checkinMethod: method,
      reason: appt.reason,
      appointmentId: appt.id,
    });
  }

  /** Hàng đợi hôm nay; lọc theo bác sĩ nếu có. */
  today(doctorId?: string) {
    return this.prisma.visit.findMany({
      where: { date: todayVN(), ...(doctorId ? { doctorId } : {}) },
      orderBy: [{ doctorId: 'asc' }, { queueNumber: 'asc' }],
      select: visitView,
    });
  }

  /**
   * Bác sĩ gọi số tiếp theo: số WAITING nhỏ nhất chuyển sang IN_PROGRESS.
   * Phải xong (hoặc đánh dấu bỏ về) lượt đang khám trước khi gọi tiếp.
   */
  async callNext(doctorId: string) {
    const date = todayVN();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`call:${doctorId}:${date.toISOString()}`}))`;
      const current = await tx.visit.findFirst({ where: { doctorId, date, status: 'IN_PROGRESS' } });
      if (current) throw new ConflictException(`Bạn đang khám số ${current.queueNumber}, hãy hoàn tất trước khi gọi tiếp`);
      const next = await tx.visit.findFirst({ where: { doctorId, date, status: 'WAITING' }, orderBy: { queueNumber: 'asc' } });
      if (!next) throw new NotFoundException('Không còn bệnh nhân nào đang chờ');
      return tx.visit.update({ where: { id: next.id }, data: { status: 'IN_PROGRESS' }, select: visitView });
    });
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

  /** Số người phía trước và số đang khám, cho màn hình "Số thứ tự của tôi". */
  async position(visitId: string, patientId?: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId }, select: visitView });
    if (!visit || (patientId && visit.patient.id !== patientId)) throw new NotFoundException('Không tìm thấy phiếu khám');

    const [ahead, current] = await Promise.all([
      this.prisma.visit.count({
        where: { doctorId: visit.doctor.id, date: visit.date, status: 'WAITING', queueNumber: { lt: visit.queueNumber } },
      }),
      this.prisma.visit.findFirst({
        where: { doctorId: visit.doctor.id, date: visit.date, status: 'IN_PROGRESS' },
        select: { queueNumber: true },
      }),
    ]);
    return { visit, peopleAhead: visit.status === 'WAITING' ? ahead : 0, currentNumber: current?.queueNumber ?? null };
  }

  async doctorIdOf(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new ForbiddenException('Tài khoản không gắn với bác sĩ nào');
    return doctor.id;
  }
}
