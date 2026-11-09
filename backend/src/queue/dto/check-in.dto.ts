import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CheckInDto {
  @IsString() appointmentId: string;
  /** Lễ tân check-in ngoài khung giờ (đến quá sớm hoặc quá trễ) */
  @IsOptional() @IsBoolean() override?: boolean;
}
