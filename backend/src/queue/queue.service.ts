import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CheckinMethod, VisitSource } from '../generated/prisma/enums.js';

export { todayVN } from '../common/time.js';
import { todayVN } from '../common/time.js';

export interface IssueTicketInput {
  patientId: string;
  doctorId: string;
  source: VisitSource;
  checkinMethod: CheckinMethod;
  reason?: string;
  appointmentId?: string;
}

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cấp số thứ tự. Hai người lấy số cùng lúc có thể đọc cùng một số lớn nhất;
   * khi đó ràng buộc unique (doctorId, date, queueNumber) làm một giao dịch lỗi P2002
   * và ta thử lại với số kế tiếp.
   */
  async issueTicket(input: IssueTicketInput) {
    const date = todayVN();
    const doctor = await this.prisma.doctor.findUnique({ where: { id: input.doctorId } });
    if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ');

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Mỗi bệnh nhân chỉ giữ một số đang chờ cho mỗi chuyên khoa trong ngày
          const waiting = await tx.visit.findFirst({
            where: {
              patientId: input.patientId,
              date,
              status: 'WAITING',
              doctor: { specialtyId: doctor.specialtyId },
            },
          });
          if (waiting) {
            throw new ConflictException(`Bạn đang giữ số ${waiting.queueNumber} cho chuyên khoa này`);
          }

          const last = await tx.visit.aggregate({
            where: { doctorId: input.doctorId, date },
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
            },
          });
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    throw new ConflictException('Hệ thống đang bận, vui lòng thử lại');
  }

  /** Bệnh nhân đứng trước và số đang khám, cho màn hình "Số thứ tự của tôi". */
  async position(visitId: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
    if (!visit) throw new NotFoundException('Không tìm thấy phiếu khám');

    const [ahead, current] = await Promise.all([
      this.prisma.visit.count({
        where: {
          doctorId: visit.doctorId,
          date: visit.date,
          status: 'WAITING',
          queueNumber: { lt: visit.queueNumber },
        },
      }),
      this.prisma.visit.findFirst({
        where: { doctorId: visit.doctorId, date: visit.date, status: 'IN_PROGRESS' },
        select: { queueNumber: true },
      }),
    ]);

    return {
      queueNumber: visit.queueNumber,
      status: visit.status,
      peopleAhead: ahead,
      currentNumber: current?.queueNumber ?? null,
    };
  }
}
