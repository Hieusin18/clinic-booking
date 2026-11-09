import { Module } from '@nestjs/common';
import { PhoneVerifyController } from './phone-verify.controller.js';
import { PhoneVerifyService } from './phone-verify.service.js';
import { SmsController } from './sms.controller.js';

@Module({ controllers: [PhoneVerifyController, SmsController], providers: [PhoneVerifyService], exports: [PhoneVerifyService] })
export class PhoneVerifyModule {}
