import { IsOptional, IsString } from 'class-validator';
import { PageQuery } from '../../common/dto/page-query.dto.js';

export class DoctorQuery extends PageQuery {
  @IsOptional() @IsString() specialtyId?: string;
}
