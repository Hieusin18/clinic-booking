import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { patientIdOf } from '../appointments/appointments.js';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { todayVN } from '../common/time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { verifyQrToken } from '../qr/qr-token.js';
import { QueueService, visitView } from './queue.service.js';

class ScanQrDto {
  /** Chuỗi đọc được từ mã QR ở quầy */
  @IsString() token: string;
  /** Bắt buộc khi chưa đặt lịch hôm nay */
  @IsOptional() @IsString() doctorId?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class WalkInDto {
  @IsString() patientId: string;
  @IsString() doctorId: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class CheckInDto {
  @IsString() appointmentId: string;
}

class TodayQuery {
  @IsOptional() @IsString() doctorId?: string;
}

@ApiTags('queue')
@ApiBearerAuth()
@Controller('queue')
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Bệnh nhân quét QR tại quầy: nếu đã đặt lịch hôm nay thì tự check-in,
   * nếu chưa thì lấy số mới cho bác sĩ đã chọn.
   */
  @Roles('PATIENT')
  @Post('scan')
  async scan(@CurrentUser() user: AuthUser, @Body() dto: ScanQrDto) {
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

    const patientId = await patientIdOf(this.prisma, user);
    const booked = await this.prisma.appointment.findFirst({
      where: { patientId, status: { in: ['PENDING', 'CONFIRMED'] }, schedule: { date: todayVN() }, visit: null },
      orderBy: { schedule: { startTime: 'asc' } },
    });
    if (booked) return this.queue.checkIn(booked.id, 'QR', patientId);

    if (!dto.doctorId) throw new BadRequestException('Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ');
    return this.queue.issueTicket({ patientId, doctorId: dto.doctorId, source: 'WALK_IN', checkinMethod: 'QR', reason: dto.reason });
  }

  /** Phiếu khám hôm nay của bệnh nhân đang đăng nhập */
  @Roles('PATIENT')
  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    const patientId = await patientIdOf(this.prisma, user);
    return this.prisma.visit.findMany({
      where: { patientId, date: todayVN() },
      orderBy: { createdAt: 'desc' },
      select: visitView,
    });
  }

  @Roles('PATIENT', 'RECEPTIONIST', 'ADMIN', 'DOCTOR')
  @Get(':visitId/position')
  async position(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string) {
    const patientId = user.role === 'PATIENT' ? await patientIdOf(this.prisma, user) : undefined;
    return this.queue.position(visitId, patientId);
  }

  /** Lễ tân cấp số cho bệnh nhân đến trực tiếp (không dùng app) */
  @Roles('RECEPTIONIST')
  @Post('tickets')
  walkIn(@Body() dto: WalkInDto) {
    return this.queue.issueTicket({ ...dto, source: 'WALK_IN', checkinMethod: 'RECEPTION' });
  }

  /** Lễ tân check-in cho bệnh nhân đã đặt lịch */
  @Roles('RECEPTIONIST')
  @Post('checkin')
  checkIn(@Body() dto: CheckInDto) {
    return this.queue.checkIn(dto.appointmentId, 'RECEPTION');
  }

  /** Hàng đợi hôm nay của cả phòng khám (lọc theo bác sĩ) */
  @Roles('RECEPTIONIST', 'ADMIN')
  @Get('today')
  today(@Query() q: TodayQuery) {
    return this.queue.today(q.doctorId);
  }

  /** Hàng đợi hôm nay của bác sĩ đang đăng nhập */
  @Roles('DOCTOR')
  @Get('doctor')
  async doctorQueue(@CurrentUser() user: AuthUser) {
    return this.queue.today(await this.queue.doctorIdOf(user.sub));
  }

  @Roles('DOCTOR')
  @Post('call-next')
  @HttpCode(200)
  async callNext(@CurrentUser() user: AuthUser) {
    return this.queue.callNext(await this.queue.doctorIdOf(user.sub));
  }

  /** Đánh dấu bỏ về; bác sĩ chỉ đánh dấu được bệnh nhân của mình */
  @Roles('DOCTOR', 'RECEPTIONIST')
  @Patch(':visitId/left')
  async markLeft(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string) {
    const doctorId = user.role === 'DOCTOR' ? await this.queue.doctorIdOf(user.sub) : undefined;
    return this.queue.markLeft(visitId, doctorId);
  }
}
