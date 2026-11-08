import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Gender } from '../generated/prisma/enums.js';

export const PHONE_REGEX = /^0\d{9}$/;
export const PHONE_MESSAGE = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0';

export class RegisterDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  /** Độ mạnh kiểm tra ở AuthService (passwordProblem) */
  @IsString() @MaxLength(72) password: string;
  /** Ngày sinh, dạng YYYY-MM-DD */
  @IsDateString() dateOfBirth: string;
  @IsEnum(Gender) gender: Gender;
  @IsOptional() @IsEmail() email?: string;
}

export class LoginDto {
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsString() password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(72) currentPassword: string;
  @IsString() @MaxLength(72) newPassword: string;
}
