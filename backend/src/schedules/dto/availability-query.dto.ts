import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AvailabilityQuery {
  /** Số ngày tính từ hôm nay (mặc định 7) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(14) days?: number;
}
