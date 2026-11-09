import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { IcdQuery } from './dto/icd-query.dto.js';
import { searchIcd } from './icd10.util.js';

@ApiTags('icd10')
@ApiBearerAuth()
@Controller('icd10')
export class Icd10Controller {
  /** Tìm mã ICD-10 theo mã hoặc tên bệnh (không cần gõ dấu) */
  @Roles('DOCTOR')
  @Get()
  search(@Query() q: IcdQuery) {
    return searchIcd(q.q);
  }
}
