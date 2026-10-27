import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, ConflictException, Param, Patch, Post, Query, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Public, Roles } from '../auth/decorators.js';
import { PageQuery, skipTake, toPage } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

export class CreateSpecialtyDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
}
export class UpdateSpecialtyDto extends PartialType(CreateSpecialtyDto) {}

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

@Module({ controllers: [SpecialtiesController], providers: [SpecialtiesService] })
export class SpecialtiesModule {}
