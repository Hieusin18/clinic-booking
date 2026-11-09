import { IsDateString, IsOptional } from 'class-validator';
import { PageQuery } from '../../common/dto/page-query.dto.js';

/** Tìm bệnh án đã khám: ?q=tên, SĐT, chẩn đoán hoặc mã ICD&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=20 */
export class ExaminedQuery extends PageQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
