import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PageQuery } from '../common/dto/page-query.dto.js';
import { CreateReceptionistDto } from './dto/create-receptionist.dto.js';
import { UpdateReceptionistDto } from './dto/update-receptionist.dto.js';
import { StaffService } from './staff.service.js';

@ApiTags('staff')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('staff/receptionists')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  list(@Query() q: PageQuery) {
    return this.service.list(q);
  }

  @Post()
  create(@Body() dto: CreateReceptionistDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReceptionistDto) {
    return this.service.update(id, dto);
  }
}
