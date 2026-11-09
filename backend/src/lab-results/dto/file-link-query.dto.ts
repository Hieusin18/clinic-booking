import { IsString } from 'class-validator';

export class FileLinkQuery {
  @IsString() exp: string;
  @IsString() sig: string;
}
