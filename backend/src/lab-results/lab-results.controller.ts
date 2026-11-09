import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { FileLinkQuery } from './dto/file-link-query.dto.js';
import { LabOrderDto } from './dto/lab-order.dto.js';
import { LabResultDto } from './dto/lab-result.dto.js';
import { SendForTestsDto } from './dto/send-for-tests.dto.js';
import { LabResultsService } from './lab-results.service.js';
import { LAB_FILE_MAX_BYTES } from './utils/lab-files.util.js';

const fileUpload = FileInterceptor('file', { limits: { fileSize: LAB_FILE_MAX_BYTES + 1024 * 1024, files: 1 } });

@ApiTags('lab')
@ApiBearerAuth()
@Controller()
export class LabResultsController {
  constructor(private readonly lab: LabResultsService) {}

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
