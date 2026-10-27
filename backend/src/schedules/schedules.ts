import { BadRequestException, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Post, Query, Body, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/decorators.js';
import { dateOnly, vnDateString, vnDateTime } from '../common/time.js';
import { PrismaService } from '../prisma/prisma.service.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateSlotsDto {
  /** Ngày khám, dạng YYYY-MM-DD */
  @IsDateString() date: string;
  /** Giờ bắt đầu ca, dạng HH:mm (giờ Việt Nam) */
  @Matches(HHMM, { message: 'Giờ bắt đầu phải có dạng HH:mm' }) start: string;
  /** Giờ kết thúc ca, dạng HH:mm */
  @Matches(HHMM, { message: 'Giờ kết thúc phải có dạng HH:mm' }) end: string;
  /** Độ dài mỗi lượt khám (phút) */
  @Type(() => Number) @IsInt() @Min(5) @Max(120) slotMinutes: number;
}

export class DateQuery {
  /** YYYY-MM-DD; bỏ trống = hôm nay */
  @IsOptional() @IsDateString() date?: string;
}

export class RangeQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async doctorIdOf(user: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.sub } });
    if (!doctor) throw new ForbiddenException('Tài khoản không gắn với bác sĩ nào');
    return doctor.id;
  }

  /** Bác sĩ mở hàng loạt khung giờ trong một ca; khung giờ đã có thì bỏ qua. */
  async createSlots(user: AuthUser, dto: CreateSlotsDto) {
    const doctorId = await this.doctorIdOf(user);
    const ymd = dto.date.slice(0, 10);
    if (ymd < vnDateString()) throw new BadRequestException('Không tạo được khung giờ cho ngày đã qua');
    if (dto.end <= dto.start) throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu');

    const startAt = vnDateTime(ymd, dto.start).getTime();
    const endAt = vnDateTime(ymd, dto.end).getTime();
    const step = dto.slotMinutes * 60_000;
    const now = Date.now();
    const data = [];
    for (let t = startAt; t + step <= endAt; t += step) {
      if (t <= now) continue; // bỏ các lượt đã qua giờ trong ngày hôm nay
      data.push({ doctorId, date: dateOnly(ymd), startTime: new Date(t), endTime: new Date(t + step) });
    }
    if (data.length === 0) throw new BadRequestException('Ca làm việc ngắn hơn một lượt khám hoặc đã qua giờ');

    const { count } = await this.prisma.schedule.createMany({ data, skipDuplicates: true });
    return { created: count, skipped: data.length - count };
  }

  /** Lịch làm việc của bác sĩ trong khoảng ngày, kèm bệnh nhân đã đặt. */
  async mine(user: AuthUser, q: RangeQuery) {
    const doctorId = await this.doctorIdOf(user);
    return this.prisma.schedule.findMany({
      where: { doctorId, date: { gte: dateOnly(q.from.slice(0, 10)), lte: dateOnly(q.to.slice(0, 10)) } },
      orderBy: { startTime: 'asc' },
      include: {
        appointments: {
          where: { status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] } },
          select: { id: true, status: true, reason: true, patient: { select: { id: true, fullName: true, phone: true } } },
        },
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    const doctorId = await this.doctorIdOf(user);
    const slot = await this.prisma.schedule.findUnique({ where: { id } });
    if (!slot || slot.doctorId !== doctorId) throw new NotFoundException('Không tìm thấy khung giờ');
    // Chỉ xóa khi chưa ai đặt; deleteMany có điều kiện để không xóa nhầm khung giờ vừa được đặt
    const { count } = await this.prisma.schedule.deleteMany({
      where: { id, isBooked: false, appointments: { none: {} } },
    });
    if (count === 0) throw new ConflictException('Khung giờ đã có người đặt, không xóa được');
  }

  /** Khung giờ còn trống của một bác sĩ trong ngày (bệnh nhân xem). */
  async available(doctorId: string, q: DateQuery) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
    if (!doctor || !doctor.user.isActive) throw new NotFoundException('Không tìm thấy bác sĩ');
    const ymd = q.date?.slice(0, 10) ?? vnDateString();
    return this.prisma.schedule.findMany({
      where: { doctorId, date: dateOnly(ymd), isBooked: false, startTime: { gt: new Date() } },
      orderBy: { startTime: 'asc' },
      select: { id: true, startTime: true, endTime: true },
    });
  }
}

@ApiTags('schedules')
@Controller()
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Post('schedules/bulk')
  createSlots(@CurrentUser() user: AuthUser, @Body() dto: CreateSlotsDto) {
    return this.service.createSlots(user, dto);
  }

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Get('schedules/mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    return this.service.mine(user, q);
  }

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Delete('schedules/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  @Public()
  @Get('doctors/:id/schedules')
  available(@Param('id') id: string, @Query() q: DateQuery) {
    return this.service.available(id, q);
  }
}

@Module({ controllers: [SchedulesController], providers: [SchedulesService], exports: [SchedulesService] })
export class SchedulesModule {}
