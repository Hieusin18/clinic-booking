import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() @MaxLength(72) currentPassword: string;
  @IsString() @MaxLength(72) newPassword: string;
  /** Token thông báo đẩy của máy đang dùng: giữ lại, các máy khác thôi nhận thông báo */
  @IsOptional() @IsString() @MaxLength(200) pushToken?: string;
}
