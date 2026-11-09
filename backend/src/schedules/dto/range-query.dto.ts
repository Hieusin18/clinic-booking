import { IsDateString } from 'class-validator';

export class RangeQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}
