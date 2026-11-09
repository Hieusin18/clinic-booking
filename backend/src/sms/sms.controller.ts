import { Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { InboundSmsQuery } from './dto/inbound-sms-query.dto.js';
import { PhoneVerifyService } from './phone-verify.service.js';

@ApiTags('sms')
@Controller('sms')
export class SmsController {
  constructor(private readonly service: PhoneVerifyService) {}

  /** Cổng SMS chuyển tin nhắn đến (iPhone Phím tắt / Android SMS Gateway). Luôn trả 200 khi đã xác thực. */
  @Public()
  @Post('inbound')
  @HttpCode(200)
  inbound(@Req() req: Request & { rawBody?: Buffer }) {
    const msg = this.service.authenticate(req);
    return this.service.handleInbound(msg.source, msg.from, msg.body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('inbound')
  recent(@Query() q: InboundSmsQuery) {
    return this.service.recentInbound(q.limit);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('config')
  config() {
    return this.service.configView();
  }
}
