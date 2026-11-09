import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ScanQrDto {
  /** Chuỗi đọc được từ mã QR ở quầy */
  @IsString() token: string;
  /** Bắt buộc khi chưa đặt lịch hôm nay */
  @IsOptional() @IsString() doctorId?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
