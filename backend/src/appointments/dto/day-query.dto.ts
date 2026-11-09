import { IsDateString, IsOptional } from 'class-validator';

export class DayQuery {
  /** YYYY-MM-DD; bỏ trống = hôm nay */
  @IsOptional() @IsDateString() date?: string;
}
