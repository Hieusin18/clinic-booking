import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateReceptionistDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  // Quên mật khẩu: POST /users/:id/reset-password (src/auth/accounts.controller.ts) tạo mật khẩu tạm
}
