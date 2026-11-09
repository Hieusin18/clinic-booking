import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { DateQuery } from './date-query.dto.js';

export class SlotQuery extends DateQuery {
  /** true = trả cả khung giờ đã có người đặt (isBooked) để app gạch đi */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() all?: boolean;
}
