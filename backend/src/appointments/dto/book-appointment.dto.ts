import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BookAppointmentDto {
  @IsString() scheduleId: string;
  /** Lý do khám, triệu chứng ban đầu */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
