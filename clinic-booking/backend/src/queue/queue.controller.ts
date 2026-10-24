import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';
import { verifyQrToken } from '../qr/qr-token.js';
import { QueueService, todayVN } from './queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

class ScanQrDto {
  @IsString() token: string;
  /** TODO (tuần 1): lấy patientId từ JWT thay vì từ body. */
  @IsString() patientId: string;
  /** Bắt buộc khi chưa đặt lịch hôm nay */
  @IsOptional() @IsString() doctorId?: string;
  @IsOptional() @IsString() reason?: string;
}

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Bệnh nhân quét QR tại quầy: tự check-in nếu đã đặt lịch hôm nay, nếu chưa thì lấy số mới. */
  @Post('scan')
  async scan(@Body() dto: ScanQrDto) {
    const check = verifyQrToken(dto.token, {
      secret: this.config.getOrThrow('QR_SECRET'),
      clinicId: this.config.getOrThrow('CLINIC_ID'),
      ttlSeconds: Number(this.config.get('QR_TTL_SECONDS') ?? 60),
    });
    if (!check.ok) {
      throw new BadRequestException(
        check.reason === 'expired' ? 'Mã QR đã hết hạn, vui lòng quét lại mã trên màn hình' : 'Mã QR không hợp lệ',
      );
    }

    const today = todayVN();
    const booked = await this.prisma.appointment.findFirst({
      where: {
        patientId: dto.patientId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        schedule: { date: today },
        visit: null,
      },
      include: { schedule: true },
    });

    if (booked) {
      return this.queue.issueTicket({
        patientId: dto.patientId,
        doctorId: booked.schedule.doctorId,
        source: 'ONLINE',
        checkinMethod: 'QR',
        reason: booked.reason ?? undefined,
        appointmentId: booked.id,
      });
    }

    if (!dto.doctorId) throw new BadRequestException('Vui lòng chọn bác sĩ hoặc chuyên khoa');
    return this.queue.issueTicket({
      patientId: dto.patientId,
      doctorId: dto.doctorId,
      source: 'WALK_IN',
      checkinMethod: 'QR',
      reason: dto.reason,
    });
  }

  @Get(':visitId/position')
  position(@Param('visitId') visitId: string) {
    return this.queue.position(visitId);
  }
}
