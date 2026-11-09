import { IsIn, Matches } from 'class-validator';
import type { PhoneVerifyPurpose } from '../../generated/prisma/enums.js';

export class StartVerificationDto {
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0' }) phone: string;
  @IsIn(['REGISTER', 'RESET_PASSWORD']) purpose: PhoneVerifyPurpose;
}
