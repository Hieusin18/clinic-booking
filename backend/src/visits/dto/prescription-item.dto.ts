import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PrescriptionItemDto {
  @IsString() medicineId: string;
  /** Tổng số lượng cần mua (theo đơn vị của thuốc) */
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) quantity: number;
  /** Liều mỗi lần, ví dụ "1 viên" */
  @IsString() @MinLength(1) @MaxLength(50) dosePerTime: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) timesPerDay: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(90) days: number;
  /** Ví dụ "uống sau ăn" */
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
