import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/constants/validation.constants.js';

export class CreateDoctorDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  /** Mật khẩu ban đầu: cùng quy tắc với mật khẩu người dùng tự đặt (auth/utils/password.util.ts) */
  @IsString() @MaxLength(72) password: string;
  @IsString() specialtyId: string;
  /** Học hàm, học vị: "ThS.BS", "BSCKII"… */
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  /** Phòng khám, ví dụ "Phòng 2" */
  @IsOptional() @IsString() @MaxLength(40) room?: string;
}
