import { IsString, MaxLength } from 'class-validator';

export class VerificationStatusQuery {
  @IsString() @MaxLength(100) ticket: string;
}
