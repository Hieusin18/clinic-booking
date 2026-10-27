import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators.js';
import { createQrToken } from './qr-token.js';

@ApiTags('queue')
@ApiBearerAuth()
@Controller('qr')
export class QrController {
  constructor(private readonly config: ConfigService) {}

  /**
   * Màn hình quầy gọi API này mỗi 30 giây để vẽ mã QR mới.
   * Máy ở quầy đăng nhập bằng tài khoản lễ tân.
   */
  @Roles('RECEPTIONIST', 'ADMIN')
  @Get('current')
  current() {
    const ttl = Number(this.config.get('QR_TTL_SECONDS') ?? 60);
    return {
      token: createQrToken(this.config.getOrThrow('CLINIC_ID'), this.config.getOrThrow('QR_SECRET')),
      refreshAfterSeconds: Math.floor(ttl / 2),
    };
  }
}
