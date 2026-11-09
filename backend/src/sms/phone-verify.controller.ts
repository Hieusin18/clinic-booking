import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { StartVerificationDto } from './dto/start-verification.dto.js';
import { VerificationStatusQuery } from './dto/verification-status-query.dto.js';
import { PhoneVerifyService } from './phone-verify.service.js';

@ApiTags('auth')
@Controller('auth/phone-verifications')
export class PhoneVerifyController {
  constructor(private readonly service: PhoneVerifyService) {}

  /** Bắt đầu xác minh số: trả mã để người dùng nhắn tới số của phòng khám */
  @Public()
  @Post()
  start(@Body() dto: StartVerificationDto, @Ip() ip: string) {
    return this.service.start(dto, ip);
  }

  /** App hỏi trạng thái (mỗi 2 giây) cho tới khi VERIFIED / EXPIRED */
  @Public()
  @Get(':id')
  status(@Param('id', ParseUUIDPipe) id: string, @Query() q: VerificationStatusQuery) {
    return this.service.status(id, q.ticket);
  }
}
