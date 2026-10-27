import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators.js';
import { PageQuery, skipTake, toPage } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class CreateMedicineDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() activeIngredient?: string;
  /** Hàm lượng, ví dụ "500mg" */
  @IsOptional() @IsString() strength?: string;
  /** Đơn vị bán: viên, vỉ, chai, tuýp… */
  @IsString() unit: string;
}

export class UpdateMedicineDto extends PartialType(CreateMedicineDto) {
  /** false = ngừng dùng: không hiện khi kê đơn nhưng đơn cũ vẫn giữ */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MedicineQuery extends PageQuery {
  /** Admin truyền true để xem cả thuốc đã ngừng dùng */
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeInactive?: boolean;
}

@Injectable()
export class MedicinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: MedicineQuery) {
    const where: Prisma.MedicineWhereInput = {
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { activeIngredient: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.medicine.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(q) }),
      this.prisma.medicine.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  create(dto: CreateMedicineDto) {
    return this.prisma.medicine.create({ data: dto });
  }

  async update(id: string, dto: UpdateMedicineDto) {
    if (!(await this.prisma.medicine.findUnique({ where: { id } }))) {
      throw new NotFoundException('Không tìm thấy thuốc');
    }
    return this.prisma.medicine.update({ where: { id }, data: dto });
  }
}

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

@Module({ controllers: [MedicinesController], providers: [MedicinesService] })
export class MedicinesModule {}
