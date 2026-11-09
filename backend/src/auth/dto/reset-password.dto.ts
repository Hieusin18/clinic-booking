import { IsString, IsUUID, MaxLength } from 'class-validator';

/** Quên mật khẩu: dùng phiên xác minh số điện thoại (mục đích RESET_PASSWORD) để đặt mật khẩu mới */
export class ResetPasswordDto {
  @IsUUID() verificationId: string;
  @IsString() @MaxLength(100) ticket: string;
  @IsString() @MaxLength(72) newPassword: string;
}
