import { Module } from '@nestjs/common';
import { QrController } from './qr.controller.js';

/** Mã QR động ở quầy để bệnh nhân quét lấy số (kiểm tra mã ở queue/queue.controller.ts) */
@Module({ controllers: [QrController] })
export class QrModule {}
