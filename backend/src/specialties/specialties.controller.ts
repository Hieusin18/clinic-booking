import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PageQuery } from '../common/dto/page-query.dto.js';
import { CreateSpecialtyDto } from './dto/create-specialty.dto.js';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto.js';
import { SpecialtiesService } from './specialties.service.js';

@ApiTags('specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly service: SpecialtiesService) {}

  @Public()
  @Get()
  list(@Query() q: PageQuery) {
    return this.service.list(q);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateSpecialtyDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecialtyDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
