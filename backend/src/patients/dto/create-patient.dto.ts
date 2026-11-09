import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/constants/validation.constants.js';
import { Gender } from '../../generated/prisma/enums.js';

export class CreatePatientDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  /** YYYY-MM-DD */
  @IsDateString() dateOfBirth: string;
  @IsEnum(Gender) gender: Gender;
  /** Số CCCD, 12 chữ số */
  @IsOptional() @Matches(/^\d{12}$/, { message: 'Số CCCD phải gồm 12 chữ số' }) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  /** Mã thẻ BHYT */
  @IsOptional() @IsString() @MaxLength(20) insuranceNo?: string;
  /** Hạn dùng thẻ BHYT, YYYY-MM-DD */
  @IsOptional() @IsDateString() insuranceExpiry?: string;
  /** Tiền sử dị ứng (thuốc, thức ăn…) */
  @IsOptional() @IsString() @MaxLength(500) allergies?: string;
  @IsOptional() @IsString() @MaxLength(100) occupation?: string;
  @IsOptional() @IsString() @MaxLength(50) ethnicity?: string;
  /** Người nhà cần báo tin; với trẻ em là người đưa trẻ đến khám */
  @IsOptional() @IsString() @MaxLength(100) relativeName?: string;
  @IsOptional() @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) relativePhone?: string;
}
