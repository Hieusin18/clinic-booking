import { Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { dateOnly, vnDateString } from '../common/time.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class BookDto {
  @IsString() scheduleId: string;
  /** Lý do khám, triệu chứng ban đầu */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class MineQuery {
  /** upcoming = sắp tới (mặc định), past = đã qua hoặc đã hủy */
  @IsOptional() @IsIn(['upcoming', 'past']) when?: 'upcoming' | 'past';
}

export class DayQuery {
  /** YYYY-MM-DD; bỏ trống = hôm nay */
  @IsOptional() @IsDateString() date?: string;
}

const ACTIVE = ['PENDING', 'CONFIRMED'] as const;

const appointmentView = {
  id: true,
  status: true,
  reason: true,
  createdAt: true,
  schedule: {
    select: {
      id: true,
      startTime: true,
      endTime: true,
      doctor: { select: { id: true, title: true, user: { select: { fullName: true } }, specialty: { select: { id: true, name: true } } } },
    },
  },
  patient: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.AppointmentSelect;

/** Tìm hồ sơ bệnh nhân gắn với tài khoản đang đăng nhập. */
export async function patientIdOf(prisma: PrismaService, user: AuthUser) {
  const patient = await prisma.patient.findUnique({ where: { userId: user.sub } });
  if (!patient) throw new ForbiddenException('Tài khoản chưa có hồ sơ bệnh nhân');
  return patient.id;
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đặt lịch chống trùng: updateMany chỉ đánh dấu isBooked khi khung giờ còn trống.
   * PostgreSQL khóa dòng khi cập nhật, nên hai yêu cầu đồng thời chỉ một bên được count = 1.
   */
  async book(user: AuthUser, dto: BookDto) {
    const patientId = await patientIdOf(this.prisma, user);
    const slot = await this.prisma.schedule.findUnique({ where: { id: dto.scheduleId } });
    if (!slot) throw new NotFoundException('Không tìm thấy khung giờ');
    if (slot.startTime <= new Date()) throw new ConflictException('Khung giờ đã qua, vui lòng chọn giờ khác');

    const sameDay = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        status: { in: [...ACTIVE] },
        schedule: { doctorId: slot.doctorId, date: slot.date },
      },
    });
    if (sameDay) throw new ConflictException('Bạn đã có lịch với bác sĩ này trong ngày');

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.schedule.updateMany({
        where: { id: slot.id, isBooked: false, startTime: { gt: new Date() } },
        data: { isBooked: true },
      });
      if (count === 0) throw new ConflictException('Khung giờ này vừa có người đặt, vui lòng chọn giờ khác');
      return tx.appointment.create({
        data: { patientId, scheduleId: slot.id, reason: dto.reason, status: 'CONFIRMED' },
        select: appointmentView,
      });
    });
  }

  async mine(user: AuthUser, q: MineQuery) {
    const patientId = await patientIdOf(this.prisma, user);
    const now = new Date();
    const upcoming = (q.when ?? 'upcoming') === 'upcoming';
    return this.prisma.appointment.findMany({
      where: upcoming
        ? { patientId, status: { in: [...ACTIVE] }, schedule: { startTime: { gt: now } } }
        : { patientId, OR: [{ status: { notIn: [...ACTIVE] } }, { schedule: { startTime: { lte: now } } }] },
      orderBy: { schedule: { startTime: upcoming ? 'asc' : 'desc' } },
      select: appointmentView,
    });
  }

  /** Bệnh nhân hủy lịch của mình trước giờ khám; khung giờ được mở lại cho người khác. */
  async cancel(user: AuthUser, id: string) {
    const patientId = await patientIdOf(this.prisma, user);
    const appt = await this.prisma.appointment.findUnique({ where: { id }, include: { schedule: true, visit: true } });
    if (!appt || appt.patientId !== patientId) throw new NotFoundException('Không tìm thấy lịch hẹn');
    if (!ACTIVE.includes(appt.status as (typeof ACTIVE)[number])) throw new ConflictException('Lịch hẹn này đã được xử lý');
    if (appt.visit) throw new ConflictException('Bạn đã check-in, không hủy được lịch');
    if (appt.schedule.startTime <= new Date()) throw new ConflictException('Không hủy được lịch đã qua giờ khám');

    return this.prisma.$transaction(async (tx) => {
      await tx.schedule.update({ where: { id: appt.scheduleId }, data: { isBooked: false } });
      return tx.appointment.update({ where: { id }, data: { status: 'CANCELLED' }, select: appointmentView });
    });
  }

  /** Lịch hẹn trong ngày của cả phòng khám (lễ tân dùng để check-in). */
  byDay(q: DayQuery) {
    const date = dateOnly(q.date?.slice(0, 10) ?? vnDateString());
    return this.prisma.appointment.findMany({
      where: { status: { in: [...ACTIVE, 'COMPLETED'] }, schedule: { date } },
      orderBy: { schedule: { startTime: 'asc' } },
      select: { ...appointmentView, visit: { select: { id: true, queueNumber: true, status: true } } },
    });
  }
}

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Roles('PATIENT')
  @Post()
  book(@CurrentUser() user: AuthUser, @Body() dto: BookDto) {
    return this.service.book(user, dto);
  }

  @Roles('PATIENT')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: MineQuery) {
    return this.service.mine(user, q);
  }

  @Roles('PATIENT')
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Get()
  byDay(@Query() q: DayQuery) {
    return this.service.byDay(q);
  }
}

@Module({ controllers: [AppointmentsController], providers: [AppointmentsService] })
export class AppointmentsModule {}
