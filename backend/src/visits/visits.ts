import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { patientIdOf } from '../appointments/appointments.js';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { visitView } from '../queue/queue.service.js';

export class RecordDto {
  @IsString() @MinLength(2) @MaxLength(2000) symptoms: string;
  @IsString() @MinLength(2) @MaxLength(1000) diagnosis: string;
  /** Chỉ định: xét nghiệm, tái khám… */
  @IsOptional() @IsString() @MaxLength(2000) orders?: string;
}

export class PrescriptionItemDto {
  @IsString() medicineId: string;
  /** Tổng số lượng cần mua (theo đơn vị của thuốc) */
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) quantity: number;
  /** Liều mỗi lần, ví dụ "1 viên" */
  @IsString() @MinLength(1) @MaxLength(50) dosePerTime: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) timesPerDay: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(90) days: number;
  /** Ví dụ "uống sau ăn" */
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class PrescriptionDto {
  /** Lời dặn của bác sĩ */
  @IsOptional() @IsString() @MaxLength(1000) advice?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Đơn thuốc cần ít nhất một loại thuốc' })
  @ValidateNested({ each: true }) @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}

export class HistoryQuery {
  @IsString() patientId: string;
}

const prescriptionView = {
  id: true,
  status: true,
  advice: true,
  createdAt: true,
  finalizedAt: true,
  replacesId: true,
  doctor: { select: { id: true, title: true, user: { select: { fullName: true } } } },
  items: {
    select: {
      id: true,
      quantity: true,
      dosePerTime: true,
      timesPerDay: true,
      days: true,
      note: true,
      medicine: { select: { id: true, name: true, activeIngredient: true, strength: true, unit: true } },
    },
  },
} satisfies Prisma.PrescriptionSelect;

/** Đơn hiệu lực của một lượt khám = đơn hoàn tất mới nhất. */
function currentPrescription<T extends { status: string; finalizedAt: Date | null }>(list: T[]) {
  return list
    .filter((p) => p.status === 'FINALIZED')
    .sort((a, b) => (b.finalizedAt?.getTime() ?? 0) - (a.finalizedAt?.getTime() ?? 0))[0] ?? null;
}

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async doctorIdOf(user: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.sub } });
    if (!doctor) throw new ForbiddenException('Tài khoản không gắn với bác sĩ nào');
    return doctor.id;
  }

  /** Phiếu khám phải thuộc bác sĩ đang đăng nhập và đang khám (hoặc vừa khám xong). */
  private async ownVisit(user: AuthUser, visitId: string) {
    const doctorId = await this.doctorIdOf(user);
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
    if (!visit || visit.doctorId !== doctorId) throw new NotFoundException('Không tìm thấy phiếu khám');
    if (!['IN_PROGRESS', 'DONE'].includes(visit.status)) {
      throw new ConflictException('Chỉ ghi được cho bệnh nhân đang khám, hãy gọi số trước');
    }
    return { visit, doctorId };
  }

  async saveRecord(user: AuthUser, visitId: string, dto: RecordDto) {
    await this.ownVisit(user, visitId);
    return this.prisma.medicalRecord.upsert({
      where: { visitId },
      create: { visitId, ...dto },
      update: dto,
    });
  }

  /** Hoàn tất lượt khám: cần có bệnh án; lịch hẹn (nếu có) chuyển sang đã khám. */
  async complete(user: AuthUser, visitId: string) {
    const { visit } = await this.ownVisit(user, visitId);
    if (visit.status === 'DONE') throw new ConflictException('Lượt khám đã hoàn tất');
    if (!(await this.prisma.medicalRecord.findUnique({ where: { visitId } }))) {
      throw new ConflictException('Cần ghi bệnh án trước khi hoàn tất lượt khám');
    }
    const draft = await this.prisma.prescription.findFirst({ where: { visitId, status: 'DRAFT' } });
    if (draft) throw new ConflictException('Đơn thuốc còn ở dạng nháp, hãy hoàn tất hoặc xóa đơn');

    return this.prisma.$transaction(async (tx) => {
      if (visit.appointmentId) {
        await tx.appointment.update({ where: { id: visit.appointmentId }, data: { status: 'COMPLETED' } });
      }
      return tx.visit.update({ where: { id: visitId }, data: { status: 'DONE' }, select: visitView });
    });
  }

  /**
   * Chi tiết lượt khám. Bác sĩ phụ trách thấy cả đơn nháp; bệnh nhân chỉ thấy đơn hiệu lực.
   * Lễ tân và admin không có quyền gọi (chặn ở controller).
   */
  async detail(user: AuthUser, visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: { ...visitView, medicalRecord: true, prescriptions: { select: prescriptionView, orderBy: { createdAt: 'desc' } } },
    });
    if (!visit) throw new NotFoundException('Không tìm thấy phiếu khám');

    if (user.role === 'PATIENT') {
      if (visit.patient.id !== (await patientIdOf(this.prisma, user))) throw new NotFoundException('Không tìm thấy phiếu khám');
      const { prescriptions, ...rest } = visit;
      return { ...rest, prescription: currentPrescription(prescriptions) };
    }
    if (visit.doctor.id !== (await this.doctorIdOf(user))) throw new NotFoundException('Không tìm thấy phiếu khám');
    return { ...visit, prescription: currentPrescription(visit.prescriptions) };
  }

  /** Lịch sử khám của bệnh nhân đang đăng nhập (mới nhất trước). */
  async myHistory(user: AuthUser) {
    const patientId = await patientIdOf(this.prisma, user);
    return this.history(patientId);
  }

  /** Bác sĩ xem các lần khám trước của bệnh nhân để tham khảo. */
  async patientHistory(user: AuthUser, patientId: string) {
    await this.doctorIdOf(user);
    return this.history(patientId);
  }

  private async history(patientId: string) {
    const visits = await this.prisma.visit.findMany({
      where: { patientId, status: 'DONE' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { ...visitView, medicalRecord: true, prescriptions: { where: { status: 'FINALIZED' }, select: prescriptionView } },
    });
    return visits.map(({ prescriptions, ...v }) => ({ ...v, prescription: currentPrescription(prescriptions) }));
  }

  private async checkMedicines(items: PrescriptionItemDto[]) {
    const ids = [...new Set(items.map((i) => i.medicineId))];
    if (ids.length !== items.length) throw new BadRequestException('Một loại thuốc chỉ được ghi một dòng');
    const found = await this.prisma.medicine.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) throw new BadRequestException('Có thuốc không tồn tại hoặc đã ngừng dùng');
  }

  /**
   * Tạo đơn nháp. Nếu lượt khám đã có đơn hoàn tất thì đơn mới là đơn thay thế
   * (replacesId trỏ về đơn cũ); đơn cũ giữ nguyên để tra cứu.
   */
  async createPrescription(user: AuthUser, visitId: string, dto: PrescriptionDto) {
    const { doctorId } = await this.ownVisit(user, visitId);
    await this.checkMedicines(dto.items);
    const existing = await this.prisma.prescription.findMany({ where: { visitId } });
    if (existing.some((p) => p.status === 'DRAFT')) throw new ConflictException('Lượt khám đã có đơn nháp, hãy sửa đơn đó');
    const replaces = currentPrescription(existing);

    return this.prisma.prescription.create({
      data: {
        visitId,
        doctorId,
        advice: dto.advice,
        replacesId: replaces?.id,
        items: { create: dto.items },
      },
      select: prescriptionView,
    });
  }

  private async ownDraft(user: AuthUser, id: string) {
    const doctorId = await this.doctorIdOf(user);
    const p = await this.prisma.prescription.findUnique({ where: { id } });
    if (!p || p.doctorId !== doctorId) throw new NotFoundException('Không tìm thấy đơn thuốc');
    if (p.status !== 'DRAFT') throw new ConflictException('Đơn đã hoàn tất, không sửa được. Hãy tạo đơn mới để thay thế');
    return p;
  }

  async updatePrescription(user: AuthUser, id: string, dto: PrescriptionDto) {
    await this.ownDraft(user, id);
    await this.checkMedicines(dto.items);
    return this.prisma.$transaction(async (tx) => {
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });
      return tx.prescription.update({
        where: { id },
        data: { advice: dto.advice, items: { create: dto.items } },
        select: prescriptionView,
      });
    });
  }

  /** Hoàn tất đơn: từ đây đơn bị khóa và bệnh nhân xem được trên app. */
  async finalize(user: AuthUser, id: string) {
    await this.ownDraft(user, id);
    const { count } = await this.prisma.prescription.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'FINALIZED', finalizedAt: new Date() },
    });
    if (count === 0) throw new ConflictException('Đơn đã hoàn tất');
    return this.prisma.prescription.findUniqueOrThrow({ where: { id }, select: prescriptionView });
  }

  async removeDraft(user: AuthUser, id: string) {
    await this.ownDraft(user, id);
    await this.prisma.prescription.delete({ where: { id } });
  }
}

@ApiTags('visits')
@ApiBearerAuth()
@Controller()
export class VisitsController {
  constructor(private readonly service: VisitsService) {}

  /** Lịch sử khám của bệnh nhân đang đăng nhập, kèm bệnh án và đơn thuốc */
  @Roles('PATIENT')
  @Get('visits/mine')
  myHistory(@CurrentUser() user: AuthUser) {
    return this.service.myHistory(user);
  }

  /** Bác sĩ xem các lần khám trước của một bệnh nhân */
  @Roles('DOCTOR')
  @Get('visits/history')
  patientHistory(@CurrentUser() user: AuthUser, @Query() q: HistoryQuery) {
    return this.service.patientHistory(user, q.patientId);
  }

  @Roles('DOCTOR', 'PATIENT')
  @Get('visits/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  /** Ghi hoặc sửa bệnh án (chỉ bác sĩ phụ trách) */
  @Roles('DOCTOR')
  @Put('visits/:id/record')
  saveRecord(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RecordDto) {
    return this.service.saveRecord(user, id, dto);
  }

  @Roles('DOCTOR')
  @Post('visits/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.complete(user, id);
  }

  @Roles('DOCTOR')
  @Post('visits/:id/prescriptions')
  createPrescription(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PrescriptionDto) {
    return this.service.createPrescription(user, id, dto);
  }

  @Roles('DOCTOR')
  @Patch('prescriptions/:id')
  updatePrescription(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PrescriptionDto) {
    return this.service.updatePrescription(user, id, dto);
  }

  @Roles('DOCTOR')
  @Post('prescriptions/:id/finalize')
  @HttpCode(200)
  finalize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.finalize(user, id);
  }

  @Roles('DOCTOR')
  @Delete('prescriptions/:id')
  @HttpCode(204)
  removeDraft(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeDraft(user, id);
  }
}

@Module({ controllers: [VisitsController], providers: [VisitsService] })
export class VisitsModule {}
