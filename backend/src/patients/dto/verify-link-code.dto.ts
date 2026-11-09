import { IsString, Length } from 'class-validator';

export class VerifyLinkCodeDto {
  @IsString() @Length(4, 20) code: string;
}
