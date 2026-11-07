/**
 * Cận lâm sàng (X-quang, siêu âm, xét nghiệm…) do bác sĩ phụ trách chỉ định và trả kết quả.
 *
 * Luồng:
 *  1. Đang khám, bác sĩ thêm chỉ định rồi "gửi đi cận lâm sàng" với một trong hai cách nhận kết quả:
 *     - RETURN: bệnh nhân làm xong quay lại; bác sĩ ghi kết quả rồi đưa bệnh nhân vào lại hàng chờ,
 *       được gọi trước mọi người (bước 0 trong queue-order.ts) để đọc kết quả, kết luận, kê đơn.
 *     - ONLINE: bệnh nhân về nhà; bác sĩ ghi kết quả, kết luận, kê đơn rồi hoàn tất, bệnh nhân xem trên app.
 *     Khi đã gửi đi, lượt khám ở trạng thái AWAITING_RESULTS nên bác sĩ gọi được người tiếp theo.
 *  2. Bác sĩ tải tệp kết quả (ảnh JPG/PNG, PDF) và ghi mô tả, kết luận cho từng chỉ định.
 *
 * Tệp kết quả mở qua đường dẫn có chữ ký hết hạn sau 1 giờ (không cần header đăng nhập), để thẻ <img>
 * trên web và ảnh trong app hiển thị được. Bệnh nhân chỉ thấy kết quả khi bác sĩ đã hoàn tất lượt khám.
 */
import {
  BadRequestException,
  Module,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { fireAndForget, RealtimeService } from '../realtime/realtime.js';
import { visitView } from '../queue/queue.service.js';
import { cleanFileName, detectLabFile, LAB_FILE_MAX_BYTES, LAB_FILES_PER_ORDER, labOrderView, presentLabOrders, verifyFileLink } from './lab-files.js';
import { VisitsModule, VisitsService } from './visits.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class LabOrderDto {
  @trim() @IsString() @MinLength(2, { message: 'Nhập tên chỉ định' }) @MaxLength(200) name: string;
  @trim() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class LabResultDto {
  /** Mô tả và kết luận kết quả */
  @trim() @IsOptional() @IsString() @MaxLength(4000) resultText?: string;
  /** true = trả kết quả (cần có mô tả hoặc ít nhất một tệp); false = mở lại để sửa */
  @IsOptional() @IsBoolean() done?: boolean;
}

export class SendForTestsDto {
  @IsIn(['RETURN', 'ONLINE'], { message: 'Chọn cách nhận kết quả' }) mode: 'RETURN' | 'ONLINE';
}

export class FileLinkQuery {
  @IsString() exp: string;
  @IsString() sig: string;
}

@Injectable()
export class LabService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsService,
    config: ConfigService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  private async ownOrder(user: AuthUser, id: string) {
    const order = await this.prisma.labOrder.findUnique({ where: { id }, include: { visit: true, _count: { select: { files: true } } } });
    if (!order) throw new NotFoundException('Không tìm thấy chỉ định');
    await this.visits.ownVisit(user, order.visitId);
    return order;
  }

  private async view(id: string) {
    const o = await this.prisma.labOrder.findUniqueOrThrow({ where: { id }, select: labOrderView });
    return presentLabOrders(this.secret, [o])[0];
  }

  async addOrder(user: AuthUser, visitId: string, dto: LabOrderDto) {
    const { visit } = await this.visits.ownVisit(user, visitId);
    if (visit.status === 'DONE') throw new ConflictException('Lượt khám đã hoàn tất, không thêm chỉ định được');
    const o = await this.prisma.labOrder.create({ data: { visitId, name: dto.name, note: dto.note || null }, select: labOrderView });
    return presentLabOrders(this.secret, [o])[0];
  }

  async removeOrder(user: AuthUser, id: string) {
    const order = await this.ownOrder(user, id);
    if (order.doneAt || order._count.files > 0) throw new ConflictException('Chỉ định đã có kết quả, hãy xóa tệp và mở lại trước khi xóa');
    await this.prisma.labOrder.delete({ where: { id } });
  }

  async saveResult(user: AuthUser, id: string, dto: LabResultDto) {
    const order = await this.ownOrder(user, id);
    const resultText = dto.resultText === undefined ? order.resultText : dto.resultText || null;
    if (dto.done && !resultText && order._count.files === 0) {
      throw new BadRequestException('Ghi mô tả kết quả hoặc tải ít nhất một tệp trước khi trả kết quả');
    }
    await this.prisma.labOrder.update({
      where: { id },
      data: { resultText, ...(dto.done === undefined ? {} : { doneAt: dto.done ? (order.doneAt ?? new Date()) : null }) },
    });
    return this.view(id);
  }

  async addFile(user: AuthUser, id: string, file: { buffer: Buffer; size: number; originalname?: string } | undefined) {
    const order = await this.ownOrder(user, id);
    if (!file) throw new BadRequestException('Chưa chọn tệp');
    if (file.size > LAB_FILE_MAX_BYTES) throw new BadRequestException('Mỗi tệp tối đa 10 MB');
    const mimeType = detectLabFile(file.buffer);
    if (!mimeType) throw new BadRequestException('Chỉ nhận ảnh JPG, PNG hoặc tệp PDF');
    if (order._count.files >= LAB_FILES_PER_ORDER) throw new BadRequestException(`Mỗi chỉ định tối đa ${LAB_FILES_PER_ORDER} tệp`);
    await this.prisma.labFile.create({
      data: { labOrderId: id, fileName: cleanFileName(file.originalname, mimeType), mimeType, size: file.size, data: new Uint8Array(file.buffer) },
    });
    return this.view(id);
  }

  async removeFile(user: AuthUser, fileId: string) {
    const f = await this.prisma.labFile.findUnique({ where: { id: fileId }, select: { labOrderId: true } });
    if (!f) throw new NotFoundException('Không tìm thấy tệp');
    await this.ownOrder(user, f.labOrderId);
    await this.prisma.labFile.delete({ where: { id: fileId } });
    return this.view(f.labOrderId);
  }

  async file(id: string, q: FileLinkQuery) {
    if (!verifyFileLink(this.secret, id, q.exp, q.sig)) throw new NotFoundException('Đường dẫn tệp không hợp lệ hoặc đã hết hạn');
    const f = await this.prisma.labFile.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Không tìm thấy tệp');
    return new StreamableFile(Buffer.from(f.data), {
      type: f.mimeType,
      length: f.size,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    });
  }

  /** Gửi bệnh nhân đi làm cận lâm sàng: bác sĩ rảnh để gọi người tiếp theo. */
  async sendForTests(user: AuthUser, visitId: string, dto: SendForTestsDto, now = new Date()) {
    const { visit } = await this.visits.ownVisit(user, visitId);
    if (visit.status !== 'IN_PROGRESS') throw new ConflictException('Chỉ gửi đi cận lâm sàng được khi đang khám');
    const pending = await this.prisma.labOrder.count({ where: { visitId, doneAt: null } });
    if (pending === 0) throw new ConflictException('Thêm ít nhất một chỉ định chưa có kết quả trước khi gửi đi');
    const { count } = await this.prisma.visit.updateMany({
      where: { id: visitId, status: 'IN_PROGRESS' },
      data: { status: 'AWAITING_RESULTS', resultMode: dto.mode, sentForTestsAt: now, resultsReadyAt: null },
    });
    if (count === 0) throw new ConflictException('Lượt khám vừa thay đổi, vui lòng tải lại');
    fireAndForget(this.realtime.visitChanged(visitId));
    return this.prisma.visit.findUniqueOrThrow({ where: { id: visitId }, select: visitView });
  }

  /**
   * Chế độ quay lại: đã có đủ kết quả, đưa bệnh nhân vào lại hàng chờ hôm nay;
   * lần gọi tiếp theo sẽ gọi người này trước (để đọc kết quả).
   */
  async resultsReady(user: AuthUser, visitId: string, now = new Date()) {
    const { visit } = await this.visits.ownVisit(user, visitId);
    if (visit.status !== 'AWAITING_RESULTS' || visit.resultMode !== 'RETURN') {
      throw new ConflictException('Chỉ dùng cho bệnh nhân đi làm cận lâm sàng rồi quay lại');
    }
    await this.requireAllDone(visitId);
    await this.prisma.visit.update({ where: { id: visitId }, data: { status: 'WAITING', resultsReadyAt: now } });
    fireAndForget(this.realtime.visitChanged(visitId));
    fireAndForget(this.notifications.resultsReady(visitId));
    return this.prisma.visit.findUniqueOrThrow({ where: { id: visitId }, select: visitView });
  }

  async requireAllDone(visitId: string) {
    const pending = await this.prisma.labOrder.findMany({ where: { visitId, doneAt: null }, select: { name: true } });
    if (pending.length > 0) throw new ConflictException(`Chưa trả kết quả: ${pending.map((p) => p.name).join(', ')}`);
  }

  /** Lượt khám của bác sĩ đang chờ kết quả cận lâm sàng (mọi ngày), cũ nhất trước. */
  async awaiting(user: AuthUser) {
    const doctorId = await this.visits.doctorIdOf(user);
    return this.prisma.visit.findMany({
      where: { doctorId, status: 'AWAITING_RESULTS' },
      orderBy: { sentForTestsAt: 'asc' },
      select: visitView,
    });
  }
}

const fileUpload = FileInterceptor('file', { limits: { fileSize: LAB_FILE_MAX_BYTES + 1024 * 1024, files: 1 } });

@ApiTags('lab')
@ApiBearerAuth()
@Controller()
export class LabController {
  constructor(private readonly lab: LabService) {}

  /** Lượt khám đang chờ kết quả cận lâm sàng của bác sĩ đang đăng nhập */
  @Roles('DOCTOR')
  @Get('lab/awaiting-visits')
  awaiting(@CurrentUser() user: AuthUser) {
    return this.lab.awaiting(user);
  }

  @Roles('DOCTOR')
  @Post('visits/:id/lab-orders')
  addOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LabOrderDto) {
    return this.lab.addOrder(user, id, dto);
  }

  @Roles('DOCTOR')
  @Post('visits/:id/send-for-tests')
  @HttpCode(200)
  sendForTests(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendForTestsDto) {
    return this.lab.sendForTests(user, id, dto);
  }

  @Roles('DOCTOR')
  @Post('visits/:id/results-ready')
  @HttpCode(200)
  resultsReady(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lab.resultsReady(user, id);
  }

  @Roles('DOCTOR')
  @Patch('lab-orders/:id')
  saveResult(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LabResultDto) {
    return this.lab.saveResult(user, id, dto);
  }

  @Roles('DOCTOR')
  @Delete('lab-orders/:id')
  @HttpCode(204)
  removeOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lab.removeOrder(user, id);
  }

  /** Tải một tệp kết quả (trường "file", JPG/PNG/PDF, tối đa 10 MB) */
  @Roles('DOCTOR')
  @Post('lab-orders/:id/files')
  @UseInterceptors(fileUpload)
  addFile(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string } | undefined) {
    return this.lab.addFile(user, id, file);
  }

  @Roles('DOCTOR')
  @Delete('lab-files/:id')
  removeFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lab.removeFile(user, id);
  }

  /** Mở tệp kết quả bằng đường dẫn có chữ ký (lấy từ chi tiết lượt khám), hết hạn sau 1 giờ */
  @Public()
  @Get('lab-files/:id')
  file(@Param('id') id: string, @Query() q: FileLinkQuery) {
    return this.lab.file(id, q);
  }
}

@Module({ imports: [VisitsModule], controllers: [LabController], providers: [LabService] })
export class LabModule {}
