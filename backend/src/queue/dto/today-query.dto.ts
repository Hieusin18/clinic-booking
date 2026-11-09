import { IsOptional, IsString } from 'class-validator';

export class TodayQuery {
  @IsOptional() @IsString() doctorId?: string;
}
