import { IsOptional, IsString, MaxLength } from 'class-validator';

export class IcdQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
