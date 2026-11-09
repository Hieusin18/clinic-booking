import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/utils/transform.util.js';

export class LabResultDto {
  /** Mô tả và kết luận kết quả */
  @trim() @IsOptional() @IsString() @MaxLength(4000) resultText?: string;
  /** true = trả kết quả (cần có mô tả hoặc ít nhất một tệp); false = mở lại để sửa */
  @IsOptional() @IsBoolean() done?: boolean;
}
