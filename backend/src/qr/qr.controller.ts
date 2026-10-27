import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createQrToken } from './qr-token.js';

@Controller('qr')
export class QrController {
  constructor(private readonly config: ConfigService) {}

  /**
   * Màn hình quầy gọi API này mỗi 30 giây để vẽ mã QR mới.
   * TODO (tuần 1): chỉ cho tài khoản lễ tân/admin gọi, sau khi có guard phân quyền.
   */
  @Get('current')
  current() {
    const ttl = Number(this.config.get('QR_TTL_SECONDS') ?? 60);
    return {
      token: createQrToken(this.config.getOrThrow('CLINIC_ID'), this.config.getOrThrow('QR_SECRET')),
      refreshAfterSeconds: Math.floor(ttl / 2),
    };
  }
}
