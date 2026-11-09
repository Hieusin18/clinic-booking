import { Matches } from 'class-validator';

export class StatsRangeQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from phải có dạng YYYY-MM-DD' }) from: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to phải có dạng YYYY-MM-DD' }) to: string;
}
