import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
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
  /** Phiên xác minh số điện thoại đã xong (POST /auth/phone-verifications), bắt buộc trừ khi REQUIRE_PHONE_VERIFICATION=false */
  @IsOptional() @IsUUID() verificationId?: string;
  @IsOptional() @IsString() @MaxLength(100) ticket?: string;
}

/** Quên mật khẩu: dùng phiên xác minh số điện thoại (mục đích RESET_PASSWORD) để đặt mật khẩu mới */
export class ResetPasswordDto {
  @IsUUID() verificationId: string;
  @IsString() @MaxLength(100) ticket: string;
  @IsString() @MaxLength(72) newPassword: string;
}

export class LoginDto {
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsString() password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(72) currentPassword: string;
  @IsString() @MaxLength(72) newPassword: string;
  /** Token thông báo đẩy của máy đang dùng: giữ lại, các máy khác thôi nhận thông báo */
  @IsOptional() @IsString() @MaxLength(200) pushToken?: string;
}
