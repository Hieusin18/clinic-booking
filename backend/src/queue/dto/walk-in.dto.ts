import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WalkInDto {
  @IsString() patientId: string;
  @IsString() doctorId: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
