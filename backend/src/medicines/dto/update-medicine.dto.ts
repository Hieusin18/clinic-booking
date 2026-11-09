import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMedicineDto } from './create-medicine.dto.js';

export class UpdateMedicineDto extends PartialType(CreateMedicineDto) {
  /** false = ngừng dùng: không hiện khi kê đơn nhưng đơn cũ vẫn giữ */
  @IsOptional() @IsBoolean() isActive?: boolean;
}
