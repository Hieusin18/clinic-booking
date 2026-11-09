import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { HistoryEntry } from '../utils/doctor-profile.util.js';

export class HistoryEntryDto implements HistoryEntry {
  @Type(() => Number) @IsInt() @Min(1950) @Max(2100) fromYear: number;
  /** Bỏ trống hoặc null = đến nay */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) toYear?: number | null;
  /** Chức vụ, vị trí (công tác) hoặc văn bằng (đào tạo) */
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  /** Nơi công tác hoặc cơ sở đào tạo */
  @IsString() @MinLength(2) @MaxLength(200) place: string;
}
