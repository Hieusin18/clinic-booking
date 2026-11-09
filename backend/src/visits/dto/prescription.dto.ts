import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { PrescriptionItemDto } from './prescription-item.dto.js';

export class PrescriptionDto {
  /** Lời dặn của bác sĩ */
  @IsOptional() @IsString() @MaxLength(1000) advice?: string;
  @IsArray()
  @ArrayMinSize(1, { message: 'Đơn thuốc cần ít nhất một loại thuốc' })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
