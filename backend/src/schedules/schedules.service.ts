import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { dateOnly, todayVN, vnDateString, vnDateTime } from '../common/utils/time.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { queueRules, type QueueRules } from '../queue/utils/queue-rules.util.js';
import { AvailabilityQuery } from './dto/availability-query.dto.js';
import { CreateSlotsDto } from './dto/create-slots.dto.js';
import { RangeQuery } from './dto/range-query.dto.js';
import { SlotQuery } from './dto/slot-query.dto.js';

@Injectable()
export class SchedulesService {
  private readonly rules: QueueRules;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.rules = queueRules(config);
  }

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
  async available(doctorId: string, q: SlotQuery) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
    if (!doctor || !doctor.user.isActive) throw new NotFoundException('Không tìm thấy bác sĩ');
    const ymd = q.date?.slice(0, 10) ?? vnDateString();
    const slots = await this.prisma.schedule.findMany({
      where: { doctorId, date: dateOnly(ymd), ...(q.all ? {} : { isBooked: false }), startTime: { gt: new Date() } },
      orderBy: { startTime: 'asc' },
      select: { id: true, startTime: true, endTime: true, isBooked: true },
    });
    // Kèm khung giờ được check-in để app nhắc ngay khi bệnh nhân chọn giờ
    const MIN = 60_000;
    return slots.map((x) => ({
      ...x,
      checkinOpensAt: new Date(x.startTime.getTime() - this.rules.checkinEarlyMinutes * MIN),
      checkinClosesAt: new Date(x.startTime.getTime() + this.rules.checkinLateMinutes * MIN),
    }));
  }

  /** Số khung giờ còn trống từng ngày trong vài ngày tới, cho trang hồ sơ bác sĩ. */
  async availability(doctorId: string, q: AvailabilityQuery, now = new Date()) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
    if (!doctor || !doctor.user.isActive) throw new NotFoundException('Không tìm thấy bác sĩ');
    const first = todayVN(now);
    const dates = Array.from({ length: q.days ?? 7 }, (_, i) => new Date(first.getTime() + i * DAY));
    const rows = await this.prisma.schedule.groupBy({
      by: ['date'],
      where: { doctorId, isBooked: false, startTime: { gt: now }, date: { gte: first, lte: dates.at(-1) } },
      _count: { _all: true },
    });
    return dates.map((d) => ({
      date: d.toISOString().slice(0, 10),
      free: rows.find((r) => r.date.getTime() === d.getTime())?._count._all ?? 0,
    }));
  }
}

const DAY = 86_400_000;
