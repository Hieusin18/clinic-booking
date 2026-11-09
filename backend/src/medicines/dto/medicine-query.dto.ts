import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageQuery } from '../../common/dto/page-query.dto.js';

export class MedicineQuery extends PageQuery {
  /** Admin truyền true để xem cả thuốc đã ngừng dùng */
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeInactive?: boolean;
}
