import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { clinicInfo } from '../common/utils/clinic.util.js';
import { skipTake, toPage } from '../common/utils/pagination.util.js';
import { dateOnly } from '../common/utils/time.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { labOrderView, presentLabOrders } from '../lab-results/utils/lab-files.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ensureLinkCode } from '../patients/utils/link-code.util.js';
import { patientScopeOf, PRIVATE_FIELDS, visibleSince } from '../patients/utils/patient-scope.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { visitView } from '../queue/queue.service.js';
import { fireAndForget, RealtimeService } from '../realtime/realtime.service.js';
import { ExaminedQuery } from './dto/examined-query.dto.js';
import { PrescriptionItemDto } from './dto/prescription-item.dto.js';
import { PrescriptionDto } from './dto/prescription.dto.js';
import { RecordDto } from './dto/record.dto.js';
import { buildPrintDoc, renderDocx, renderHtml, renderPdf } from './utils/record-export.util.js';

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
    secondaryIcdCodes:
      blank(dto.secondaryIcdCodes)
        ?.split(/\s*,\s*/)
        .join(', ') ?? null,
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
  return list.filter((p) => p.status === 'FINALIZED').sort((a, b) => (b.finalizedAt?.getTime() ?? 0) - (a.finalizedAt?.getTime() ?? 0))[0] ?? null;
}

@Injectable()
export class VisitsService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
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

    const done = await this.prisma.$transaction(async (tx) => {
      if (visit.appointmentId) {
        await tx.appointment.update({ where: { id: visit.appointmentId }, data: { status: 'COMPLETED' } });
      }
      return tx.visit.update({ where: { id: visitId }, data: { status: 'DONE', completedAt: new Date() }, select: visitView });
    });
    fireAndForget(this.realtime.visitChanged(visitId));
    fireAndForget(this.notifications.visitDone(visitId));
    return done;
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
      const scope = await patientScopeOf(this.prisma, user);
      if (found.patient.id !== scope.patientId || (scope.lockedBefore && found.createdAt < scope.lockedBefore)) {
        throw new NotFoundException('Không tìm thấy phiếu khám');
      }
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
    const record = await this.prisma.patient.findUniqueOrThrow({ where: { id: visit.patient.id } });
    // Hồ sơ chưa xác minh: bản bệnh nhân tự tải không in thông tin cá nhân lễ tân đã nhập (CCCD, địa chỉ, BHYT…)
    const patient = user.role === 'PATIENT' && record.historyLockedBefore ? { ...record, ...Object.fromEntries(PRIVATE_FIELDS.map((f) => [f, null])) } : record;
    // Kết quả cận lâm sàng in kèm ảnh, nên đọc cả dữ liệu ảnh (bệnh nhân chỉ thấy khi đã hoàn tất)
    const showLab = user.role !== 'PATIENT' || visit.status === 'DONE';
    const labOrders = showLab
      ? await this.prisma.labOrder.findMany({
          where: { visitId },
          orderBy: { createdAt: 'asc' },
          select: {
            name: true,
            note: true,
            resultText: true,
            doneAt: true,
            files: { select: { fileName: true, mimeType: true, data: true }, orderBy: { createdAt: 'asc' } },
          },
        })
      : visit.labOrders.map((o) => ({ name: o.name, note: o.note, resultText: null, doneAt: null, files: [] }));
    // Bác sĩ không ghi lại lý do khám thì dùng lý do bệnh nhân khai lúc đặt lịch/lấy số
    // Bản bác sĩ in đưa bệnh nhân có mã liên kết; bản bệnh nhân tự tải thì không (tránh lộ mã cho tài khoản chưa xác minh)
    const linkCode = user.role === 'DOCTOR' ? await ensureLinkCode(this.prisma, patient.id) : undefined;
    return buildPrintDoc(
      {
        ...visit,
        patient,
        labOrders,
        medicalRecord: { ...visit.medicalRecord, reason: visit.medicalRecord.reason ?? visit.reason },
      },
      new Date(),
      { linkCode },
    );
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
    const { patientId, lockedBefore } = await patientScopeOf(this.prisma, user);
    return this.history(patientId, lockedBefore);
  }

  /** Bác sĩ xem các lần khám trước của bệnh nhân để tham khảo. */
  /**
   * Bệnh án các lượt bác sĩ đã khám xong (mọi ngày), mới nhất trước. Tìm theo tên hoặc SĐT bệnh nhân,
   * chẩn đoán hoặc mã ICD; lọc theo khoảng ngày khám.
   */
  async examined(user: AuthUser, q: ExaminedQuery) {
    const doctorId = await this.doctorIdOf(user);
    const text = q.q?.trim();
    const where: Prisma.VisitWhereInput = {
      doctorId,
      status: 'DONE',
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: dateOnly(q.from.slice(0, 10)) } : {}), ...(q.to ? { lte: dateOnly(q.to.slice(0, 10)) } : {}) } } : {}),
      ...(text
        ? {
            OR: [
              { patient: { fullName: { contains: text, mode: 'insensitive' } } },
              { patient: { phone: { startsWith: text } } },
              { medicalRecord: { diagnosis: { contains: text, mode: 'insensitive' } } },
              { medicalRecord: { icdCode: { startsWith: text.toUpperCase() } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        orderBy: [{ date: 'desc' }, { calledAt: 'desc' }, { createdAt: 'desc' }],
        ...skipTake(q),
        select: {
          ...visitView,
          medicalRecord: { select: { diagnosis: true, icdCode: true, followUpDate: true } },
          prescriptions: { where: { status: 'FINALIZED' }, select: prescriptionView },
        },
      }),
      this.prisma.visit.count({ where }),
    ]);
    return toPage(
      rows.map(({ prescriptions, ...v }) => ({ ...v, prescription: currentPrescription(prescriptions) })),
      total,
      q,
    );
  }

  async patientHistory(user: AuthUser, patientId: string) {
    await this.doctorIdOf(user);
    return this.history(patientId);
  }

  private async history(patientId: string, lockedBefore: Date | null = null) {
    const visits = await this.prisma.visit.findMany({
      // Gồm cả lượt đang chờ kết quả cận lâm sàng để bệnh nhân nhận kết quả online biết đang chờ.
      // Hồ sơ chưa xác minh: chỉ các lượt từ lúc tài khoản gắn vào hồ sơ
      where: { patientId, status: { in: ['DONE', 'AWAITING_RESULTS'] }, ...visibleSince(lockedBefore) },
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
