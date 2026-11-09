import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import type { NotificationType } from '../../generated/prisma/enums.js';
import { NOTIFICATION_TYPES } from './notification-list-query.dto.js';

export class MarkReadDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) ids?: string[];
  @IsOptional() @IsString() visitId?: string;
  @IsOptional() @IsBoolean() all?: boolean;
  /** Chỉ đánh dấu các loại này (vd. mở phiếu số thì đánh dấu tin gọi số, không đụng tin "có kết quả") */
  @IsOptional() @IsArray() @IsIn(NOTIFICATION_TYPES, { each: true }) types?: NotificationType[];
}
