import { Injectable, NotFoundException } from '@nestjs/common';
import { skipTake, toPage } from '../common/utils/pagination.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMedicineDto } from './dto/create-medicine.dto.js';
import { MedicineQuery } from './dto/medicine-query.dto.js';
import { UpdateMedicineDto } from './dto/update-medicine.dto.js';

@Injectable()
export class MedicinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: MedicineQuery) {
    const where: Prisma.MedicineWhereInput = {
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.q
        ? {
            OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { activeIngredient: { contains: q.q, mode: 'insensitive' } }],
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
