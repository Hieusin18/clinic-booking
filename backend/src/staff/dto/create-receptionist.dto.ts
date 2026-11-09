import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/constants/validation.constants.js';

export class CreateReceptionistDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  /** Mật khẩu ban đầu: cùng quy tắc với mật khẩu người dùng tự đặt (auth/utils/password.util.ts) */
  @IsString() @MaxLength(72) password: string;
}
