import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PageQuery } from '../common/dto/page-query.dto.js';
import { skipTake, toPage } from '../common/utils/pagination.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSpecialtyDto } from './dto/create-specialty.dto.js';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto.js';

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PageQuery) {
    const where: Prisma.SpecialtyWhereInput = q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {};
    const [items, total] = await Promise.all([
      this.prisma.specialty.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { _count: { select: { doctors: true } } },
        ...skipTake(q),
      }),
      this.prisma.specialty.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async create(dto: CreateSpecialtyDto) {
    await this.ensureNameFree(dto.name);
    return this.prisma.specialty.create({ data: dto });
  }

  async update(id: string, dto: UpdateSpecialtyDto) {
    await this.get(id);
    if (dto.name) await this.ensureNameFree(dto.name, id);
    return this.prisma.specialty.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    if (await this.prisma.doctor.count({ where: { specialtyId: id } })) {
      throw new ConflictException('Không xóa được chuyên khoa còn bác sĩ');
    }
    await this.prisma.specialty.delete({ where: { id } });
  }

  private async get(id: string) {
    const s = await this.prisma.specialty.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Không tìm thấy chuyên khoa');
    return s;
  }

  private async ensureNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.specialty.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (dup && dup.id !== exceptId) throw new ConflictException('Tên chuyên khoa đã tồn tại');
  }
}
