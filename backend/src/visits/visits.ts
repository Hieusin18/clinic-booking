import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { randomInt } from 'node:crypto';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { patientIdOf } from '../appointments/appointments.js';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { Prisma } from '../generated/prisma/client.js';
import { clinicInfo } from '../common/clinic.js';
import { dateOnly } from '../common/time.js';
import { ICD_REGEX } from '../icd10/icd10.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { visitView } from '../queue/queue.service.js';
import { labOrderView, presentLabOrders } from './lab-files.js';
import { buildPrintDoc, renderDocx, renderHtml, renderPdf } from './record-export.js';

const ICD_MESSAGE = 'Mã ICD-10 không hợp lệ (ví dụ J02.9)';
/** Ô để trống trên form gửi "" hoặc null: coi như không nhập. */
const EmptyToUndefined = () => Transform(({ value }) => (value === '' || value === null ? undefined : value));
/** Mã ICD: bỏ khoảng trắng thừa, viết hoa; ô trống coi như không nhập. */
const IcdInput = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value === null ? undefined : value));
const ICD_LIST = /^[A-Z]\d{2}(\.\d{1,2})?(\s*,\s*[A-Z]\d{2}(\.\d{1,2})?)*$/;

/** Bệnh án ngoại trú, bố cục theo mẫu bệnh án của Bộ Y tế. Chỉ quá trình bệnh lý và chẩn đoán là bắt buộc. */
export class RecordDto {
  // III. Hỏi bệnh
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Quá trình bệnh lý (bệnh sử, triệu chứng) */
  @IsString() @MinLength(2) @MaxLength(2000) symptoms: string;
  @IsOptional() @IsString() @MaxLength(1000) personalHistory?: string;
  @IsOptional() @IsString() @MaxLength(1000) familyHistory?: string;

  // IV. Khám bệnh
  @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(250) pulse?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(45) temperature?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(40) @Max(300) bpSystolic?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(200) bpDiastolic?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(80) respiratoryRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(100) spo2?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0.5) @Max(400) weight?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(250) height?: number;
  @IsOptional() @IsString() @MaxLength(2000) generalExam?: string;
  @IsOptional() @IsString() @MaxLength(2000) organExam?: string;
  @IsOptional() @IsString() @MaxLength(2000) labSummary?: string;
  /** Chỉ định cận lâm sàng: xét nghiệm, chẩn đoán hình ảnh… */
  @IsOptional() @IsString() @MaxLength(2000) orders?: string;

  // V. Chẩn đoán
  @IsString() @MinLength(2) @MaxLength(1000) diagnosis: string;
  @IcdInput() @IsOptional() @Matches(ICD_REGEX, { message: ICD_MESSAGE }) icdCode?: string;
  @IsOptional() @IsString() @MaxLength(1000) secondaryDiagnosis?: string;
  /** Mã ICD-10 bệnh kèm theo, cách nhau bởi dấu phẩy */
  @IcdInput() @IsOptional() @Matches(ICD_LIST, { message: ICD_MESSAGE }) secondaryIcdCodes?: string;

  // VI. Điều trị
  @IsOptional() @IsString() @MaxLength(2000) treatment?: string;
  /** Hẹn tái khám, YYYY-MM-DD */
  @EmptyToUndefined() @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày tái khám dạng YYYY-MM-DD' }) followUpDate?: string;
}

/** Chuỗi rỗng từ form nghĩa là bỏ trống: lưu null để xóa được giá trị cũ. */
function recordData(dto: RecordDto) {
  const blank = (v?: string) => (v?.trim() ? v.trim() : null);
  return {
    reason: blank(dto.reason),
    symptoms: dto.symptoms.trim(),
    personalHistory: blank(dto.personalHistory),
    familyHistory: blank(dto.familyHistory),
    pulse: dto.pulse ?? null,
    temperature: dto.temperature ?? null,
    bpSystolic: dto.bpSystolic ?? null,
    bpDiastolic: dto.bpDiastolic ?? null,
    respiratoryRate: dto.respiratoryRate ?? null,
    spo2: dto.spo2 ?? null,
    weight: dto.weight ?? null,
    height: dto.height ?? null,
    generalExam: blank(dto.generalExam),
    organExam: blank(dto.organExam),
    labSummary: blank(dto.labSummary),
    // Web mới dùng danh sách chỉ định (LabOrder); không gửi ô này thì giữ nguyên ghi chú cũ
    orders: dto.orders === undefined ? undefined : blank(dto.orders),
    diagnosis: dto.diagnosis.trim(),
    icdCode: blank(dto.icdCode),
    secondaryDiagnosis: blank(dto.secondaryDiagnosis),
    secondaryIcdCodes: blank(dto.secondaryIcdCodes)?.split(/\s*,\s*/).join(', ') ?? null,
    treatment: blank(dto.treatment),
    followUpDate: dto.followUpDate ? dateOnly(dto.followUpDate) : null,
  };
}

const CODE_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
/**
 * Mã đơn thuốc theo Thông tư 26/2025/TT-BYT: xxxxxyyyyyyy-z gồm 5 ký tự mã cơ sở,
 * 7 ký tự ngẫu nhiên và loại đơn (C = đơn thuốc thông thường).
 */
export function prescriptionCode() {
  const random = Array.from({ length: 7 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
  return `${clinicInfo().code}${random}-C`;
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
  code: true,
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
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  async doctorIdOf(user: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.sub } });
    if (!doctor) throw new ForbiddenException('Tài khoản không gắn với bác sĩ nào');
    return doctor.id;
  }

  /** Phiếu khám phải thuộc bác sĩ đang đăng nhập và đang khám, đang chờ kết quả cận lâm sàng, hoặc đã khám xong. */
  async ownVisit(user: AuthUser, visitId: string) {
    const doctorId = await this.doctorIdOf(user);
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
    if (!visit || visit.doctorId !== doctorId) throw new NotFoundException('Không tìm thấy phiếu khám');
    if (!['IN_PROGRESS', 'AWAITING_RESULTS', 'DONE'].includes(visit.status)) {
      throw new ConflictException('Chỉ ghi được cho bệnh nhân đang khám, hãy gọi số trước');
    }
    return { visit, doctorId };
  }

  async saveRecord(user: AuthUser, visitId: string, dto: RecordDto) {
    const { visit } = await this.ownVisit(user, visitId);
    const data = recordData(dto);
    if (data.followUpDate && data.followUpDate <= visit.date) throw new BadRequestException('Ngày tái khám phải sau ngày khám');
    if ((data.bpSystolic == null) !== (data.bpDiastolic == null)) throw new BadRequestException('Nhập đủ cả huyết áp tâm thu và tâm trương');
    if (data.bpSystolic != null && data.bpDiastolic != null && data.bpSystolic <= data.bpDiastolic) {
      throw new BadRequestException('Huyết áp tâm thu phải lớn hơn tâm trương');
    }
    return this.prisma.medicalRecord.upsert({
      where: { visitId },
      create: { visitId, ...data },
      update: data,
    });
  }

  /**
   * Hoàn tất lượt khám: cần có bệnh án, mọi chỉ định cận lâm sàng đã có kết quả; lịch hẹn (nếu có) chuyển sang đã khám.
   * Lượt đang chờ kết quả theo chế độ online hoàn tất được ngay (bác sĩ gửi kết quả và đơn lên app);
   * chế độ quay lại thì phải đưa bệnh nhân vào lại hàng chờ và gọi vào trước.
   */
  async complete(user: AuthUser, visitId: string) {
    const { visit } = await this.ownVisit(user, visitId);
    if (visit.status === 'DONE') throw new ConflictException('Lượt khám đã hoàn tất');
    if (visit.status === 'AWAITING_RESULTS' && visit.resultMode !== 'ONLINE') {
      throw new ConflictException('Bệnh nhân sẽ quay lại đọc kết quả: hãy đưa vào hàng chờ và gọi vào trước khi hoàn tất');
    }
    const pending = await this.prisma.labOrder.findMany({ where: { visitId, doneAt: null }, select: { name: true } });
    if (pending.length > 0) throw new ConflictException(`Chưa trả kết quả: ${pending.map((p) => p.name).join(', ')}`);
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
    const found = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        ...visitView,
        medicalRecord: true,
        prescriptions: { select: prescriptionView, orderBy: { createdAt: 'desc' } },
        labOrders: { select: labOrderView, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!found) throw new NotFoundException('Không tìm thấy phiếu khám');

    if (user.role === 'PATIENT') {
      if (found.patient.id !== (await patientIdOf(this.prisma, user))) throw new NotFoundException('Không tìm thấy phiếu khám');
      const { prescriptions, ...rest } = found;
      // Bệnh nhân chỉ thấy kết quả cận lâm sàng khi bác sĩ đã đọc và hoàn tất lượt khám
      return { ...rest, labOrders: presentLabOrders(this.secret, found.labOrders, found.status !== 'DONE'), prescription: currentPrescription(prescriptions) };
    }
    if (found.doctor.id !== (await this.doctorIdOf(user))) throw new NotFoundException('Không tìm thấy phiếu khám');
    return { ...found, labOrders: presentLabOrders(this.secret, found.labOrders), prescription: currentPrescription(found.prescriptions) };
  }

  /**
   * Bản điện tử bệnh án + đơn thuốc (PDF hoặc Word). Cùng quyền với xem chi tiết:
   * bệnh nhân của lượt khám hoặc bác sĩ phụ trách.
   */
  private async printDoc(user: AuthUser, visitId: string) {
    const visit = await this.detail(user, visitId);
    if (!visit.medicalRecord) throw new ConflictException('Lượt khám chưa có bệnh án');
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: visit.patient.id } });
    // Kết quả cận lâm sàng in kèm ảnh, nên đọc cả dữ liệu ảnh (bệnh nhân chỉ thấy khi đã hoàn tất)
    const showLab = user.role !== 'PATIENT' || visit.status === 'DONE';
    const labOrders = showLab
      ? await this.prisma.labOrder.findMany({
          where: { visitId },
          orderBy: { createdAt: 'asc' },
          select: { name: true, note: true, resultText: true, doneAt: true, files: { select: { fileName: true, mimeType: true, data: true }, orderBy: { createdAt: 'asc' } } },
        })
      : visit.labOrders.map((o) => ({ name: o.name, note: o.note, resultText: null, doneAt: null, files: [] }));
    // Bác sĩ không ghi lại lý do khám thì dùng lý do bệnh nhân khai lúc đặt lịch/lấy số
    return buildPrintDoc({
      ...visit,
      patient,
      labOrders,
      medicalRecord: { ...visit.medicalRecord, reason: visit.medicalRecord.reason ?? visit.reason },
    });
  }

  /**
   * Bản điện tử bệnh án + đơn thuốc (PDF hoặc Word). Cùng quyền với xem chi tiết:
   * bệnh nhân của lượt khám hoặc bác sĩ phụ trách.
   */
  async export(user: AuthUser, visitId: string, format: 'pdf' | 'docx') {
    const doc = await this.printDoc(user, visitId);
    const buffer = format === 'pdf' ? await renderPdf(doc) : await renderDocx(doc);
    return new StreamableFile(buffer, {
      type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="${doc.fileName}.${format}"`,
      length: buffer.length,
    });
  }

  /** Bản xem trước dạng HTML (cùng nội dung với PDF/Word) cho app và web hiển thị trước khi tải. */
  async preview(user: AuthUser, visitId: string) {
    return renderHtml(await this.printDoc(user, visitId));
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
      // Gồm cả lượt đang chờ kết quả cận lâm sàng để bệnh nhân nhận kết quả online biết đang chờ
      where: { patientId, status: { in: ['DONE', 'AWAITING_RESULTS'] } },
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
      data: { status: 'FINALIZED', finalizedAt: new Date(), code: prescriptionCode() },
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

  /** Xem trước bệnh án và đơn thuốc (HTML, không có JavaScript) */
  @Roles('DOCTOR', 'PATIENT')
  @Get('visits/:id/record.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors *")
  @Header('Cache-Control', 'no-store')
  previewHtml(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.preview(user, id);
  }

  /** Tải bệnh án và đơn thuốc dạng PDF */
  @Roles('DOCTOR', 'PATIENT')
  @Get('visits/:id/record.pdf')
  exportPdf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.export(user, id, 'pdf');
  }

  /** Tải bệnh án và đơn thuốc dạng Word (.docx) */
  @Roles('DOCTOR', 'PATIENT')
  @Get('visits/:id/record.docx')
  exportDocx(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.export(user, id, 'docx');
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

@Module({ controllers: [VisitsController], providers: [VisitsService], exports: [VisitsService] })
export class VisitsModule {}
