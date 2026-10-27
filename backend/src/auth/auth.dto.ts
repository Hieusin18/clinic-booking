import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Gender } from '../generated/prisma/enums.js';

export const PHONE_REGEX = /^0\d{9}$/;
export const PHONE_MESSAGE = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0';

export class RegisterDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsString() @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' }) password: string;
  /** Ngày sinh, dạng YYYY-MM-DD */
  @IsDateString() dateOfBirth: string;
  @IsEnum(Gender) gender: Gender;
  @IsOptional() @IsEmail() email?: string;
}

export class LoginDto {
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsString() password: string;
}
