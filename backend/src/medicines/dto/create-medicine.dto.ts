import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMedicineDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() activeIngredient?: string;
  /** Hàm lượng, ví dụ "500mg" */
  @IsOptional() @IsString() strength?: string;
  /** Đơn vị bán: viên, vỉ, chai, tuýp… */
  @IsString() unit: string;
}
