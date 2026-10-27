import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Dùng cho healthcheck của Docker và để kiểm tra sau khi deploy. */
  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}
