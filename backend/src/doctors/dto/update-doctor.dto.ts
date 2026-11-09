import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DoctorProfileDto } from './doctor-profile.dto.js';

export class UpdateDoctorDto extends DoctorProfileDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsString() specialtyId?: string;
  @IsOptional() @IsString() title?: string;
  /** Phòng khám, ví dụ "Phòng 2"; chuỗi rỗng = xóa */
  @IsOptional() @IsString() @MaxLength(40) room?: string;
  /** false = khóa tài khoản, bác sĩ không đăng nhập được và không hiện cho bệnh nhân */
  @IsOptional() @IsBoolean() isActive?: boolean;
}
