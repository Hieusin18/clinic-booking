import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { ExaminedQuery } from './dto/examined-query.dto.js';
import { HistoryQuery } from './dto/history-query.dto.js';
import { PrescriptionDto } from './dto/prescription.dto.js';
import { RecordDto } from './dto/record.dto.js';
import { VisitsService } from './visits.service.js';

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

  /** Bác sĩ tra cứu bệnh án các lượt mình đã khám xong (mọi ngày) */
  @Roles('DOCTOR')
  @Get('visits/examined')
  examined(@CurrentUser() user: AuthUser, @Query() q: ExaminedQuery) {
    return this.service.examined(user, q);
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
