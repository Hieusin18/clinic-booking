import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/constants/validation.constants.js';
import { Gender } from '../../generated/prisma/enums.js';

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
