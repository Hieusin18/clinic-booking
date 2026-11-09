import { IsIn, IsOptional } from 'class-validator';

export class MyAppointmentsQuery {
  /** upcoming = sắp tới (mặc định), past = đã qua hoặc đã hủy */
  @IsOptional() @IsIn(['upcoming', 'past']) when?: 'upcoming' | 'past';
}
