import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/utils/transform.util.js';

export class LabOrderDto {
  @trim() @IsString() @MinLength(2, { message: 'Nhập tên chỉ định' }) @MaxLength(200) name: string;
  @trim() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
