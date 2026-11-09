import { Type } from 'class-transformer';
import { IsDateString, IsInt, Matches, Max, Min } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateSlotsDto {
  /** Ngày khám, dạng YYYY-MM-DD */
  @IsDateString() date: string;
  /** Giờ bắt đầu ca, dạng HH:mm (giờ Việt Nam) */
  @Matches(HHMM, { message: 'Giờ bắt đầu phải có dạng HH:mm' }) start: string;
  /** Giờ kết thúc ca, dạng HH:mm */
  @Matches(HHMM, { message: 'Giờ kết thúc phải có dạng HH:mm' }) end: string;
  /** Độ dài mỗi lượt khám (phút) */
  @Type(() => Number) @IsInt() @Min(5) @Max(120) slotMinutes: number;
}
