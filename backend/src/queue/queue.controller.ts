import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { todayVN } from '../common/utils/time.util.js';
import { patientIdOf, patientScopeOf, visibleSince } from '../patients/utils/patient-scope.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { verifyQrToken } from '../qr/utils/qr-token.util.js';
import { CheckInDto } from './dto/check-in.dto.js';
import { ScanQrDto } from './dto/scan-qr.dto.js';
import { TodayQuery } from './dto/today-query.dto.js';
import { WalkInDto } from './dto/walk-in.dto.js';
import { QueueService, visitView } from './queue.service.js';
import { ticketLabel } from './utils/queue-order.util.js';

/** Thông báo khi quét QR mà hôm nay chưa có lịch hẹn còn hiệu lực */
export const NEEDS_DOCTOR = 'Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ';

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
   * Bệnh nhân quét QR tại quầy: có lịch hẹn hôm nay trong khung check-in thì tự check-in;
   * đến quá sớm thì báo giờ mở check-in; đến quá trễ hoặc chưa đặt lịch thì lấy số thường
   * với bác sĩ đã chọn.
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
      throw new BadRequestException(check.reason === 'expired' ? 'Mã QR đã hết hạn, vui lòng quét lại mã trên màn hình' : 'Mã QR không hợp lệ');
    }

    const now = new Date();
    const patientId = await patientIdOf(this.prisma, user);
    const booked = await this.prisma.appointment.findMany({
      where: { patientId, status: { in: ['PENDING', 'CONFIRMED'] }, schedule: { date: todayVN(now) }, visit: { is: null } },
      include: { schedule: true },
      orderBy: { schedule: { startTime: 'asc' } },
    });
    const win = (a: (typeof booked)[number]) => this.queue.checkinWindow(a.schedule.startTime);
    const open = booked.find((a) => now >= win(a).opens && now <= win(a).closes);
    if (open) return this.queue.checkIn(open.id, 'QR', { expectedPatientId: patientId, now });
    // Còn lịch hẹn chưa đến giờ: checkIn báo giờ mở check-in
    const early = booked.find((a) => now < win(a).opens);
    if (early) return this.queue.checkIn(early.id, 'QR', { expectedPatientId: patientId, now });

    // Còn lại là lịch đã quá giờ: tính là không đến, bệnh nhân lấy số thường
    const late = booked[booked.length - 1];
    if (late) {
      await this.prisma.appointment.updateMany({
        where: { id: { in: booked.map((a) => a.id) }, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'NO_SHOW' },
      });
    }
    if (!dto.doctorId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'NEEDS_DOCTOR',
        message: late ? `${this.queue.lateMessage(late.schedule.startTime)} Chọn bác sĩ để lấy số.` : NEEDS_DOCTOR,
      });
    }
    return this.queue.issueTicket({ patientId, doctorId: dto.doctorId, source: 'WALK_IN', checkinMethod: 'QR', reason: dto.reason });
  }

  /** Phiếu khám hôm nay của bệnh nhân đang đăng nhập */
  @Roles('PATIENT')
  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    const { patientId, lockedBefore } = await patientScopeOf(this.prisma, user);
    return this.prisma.visit.findMany({
      where: { patientId, date: todayVN(), ...visibleSince(lockedBefore) },
      orderBy: { createdAt: 'desc' },
      select: visitView,
    });
  }

  @Roles('PATIENT', 'RECEPTIONIST', 'ADMIN', 'DOCTOR')
  @Get(':visitId/position')
  async position(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string) {
    const scope = user.role === 'PATIENT' ? await patientScopeOf(this.prisma, user) : undefined;
    const pos = await this.queue.position(visitId, scope?.patientId);
    if (scope?.lockedBefore && pos.visit.createdAt < scope.lockedBefore) throw new NotFoundException('Không tìm thấy phiếu khám');
    return { ...pos, label: ticketLabel(pos.visit), currentLabel: pos.current ? ticketLabel(pos.current) : null };
  }

  /** Lễ tân cấp số cho bệnh nhân đến trực tiếp (không dùng app) */
  @Roles('RECEPTIONIST')
  @Post('tickets')
  walkIn(@Body() dto: WalkInDto) {
    return this.queue.issueTicket({ ...dto, source: 'WALK_IN', checkinMethod: 'RECEPTION' });
  }

  /** Lễ tân check-in cho bệnh nhân đã đặt lịch; `override` = cho phép ngoài khung giờ */
  @Roles('RECEPTIONIST')
  @Post('checkin')
  checkIn(@Body() dto: CheckInDto) {
    return this.queue.checkIn(dto.appointmentId, 'RECEPTION', { override: dto.override });
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

  /** Gọi số tiếp theo theo thứ tự ưu tiên */
  @Roles('DOCTOR')
  @Post('call-next')
  @HttpCode(200)
  async callNext(@CurrentUser() user: AuthUser) {
    return this.queue.callNext(await this.queue.doctorIdOf(user.sub));
  }

  /** Bác sĩ gọi đích danh một người đang chờ, bỏ qua thứ tự ưu tiên */
  @Roles('DOCTOR')
  @Post(':visitId/call')
  @HttpCode(200)
  async call(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string) {
    return this.queue.callVisit(await this.queue.doctorIdOf(user.sub), visitId);
  }

  /** Gọi lại số đang khám (bệnh nhân chưa vào phòng): loa ở quầy đọc lại */
  @Roles('DOCTOR')
  @Post(':visitId/recall')
  @HttpCode(200)
  async recall(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string) {
    return this.queue.recall(await this.queue.doctorIdOf(user.sub), visitId);
  }

  /** Đánh dấu bỏ về; bác sĩ chỉ đánh dấu được bệnh nhân của mình */
  @Roles('DOCTOR', 'RECEPTIONIST')
  @Patch(':visitId/left')
  async markLeft(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string) {
    const doctorId = user.role === 'DOCTOR' ? await this.queue.doctorIdOf(user.sub) : undefined;
    return this.queue.markLeft(visitId, doctorId);
  }
}
