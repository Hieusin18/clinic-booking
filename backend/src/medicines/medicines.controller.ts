import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CreateMedicineDto } from './dto/create-medicine.dto.js';
import { MedicineQuery } from './dto/medicine-query.dto.js';
import { UpdateMedicineDto } from './dto/update-medicine.dto.js';
import { MedicinesService } from './medicines.service.js';

@ApiTags('medicines')
@ApiBearerAuth()
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly service: MedicinesService) {}

  /** Tìm thuốc theo tên hoặc hoạt chất (bác sĩ dùng khi kê đơn) */
  @Roles('DOCTOR', 'ADMIN')
  @Get()
  list(@Query() q: MedicineQuery) {
    return this.service.list(q);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateMedicineDto) {
    return this.service.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMedicineDto) {
    return this.service.update(id, dto);
  }
}
