import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../auth/auth.dto.js';
import { publicUser } from '../auth/auth.service.js';
import { Roles } from '../auth/decorators.js';
import { hashPassword } from '../auth/password.js';
import { PageQuery, skipTake, toPage } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class CreateReceptionistDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' }) password: string;
}

export class UpdateReceptionistDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Đặt lại mật khẩu khi lễ tân quên */
  @IsOptional() @IsString() @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' }) password?: string;
}

/** Admin quản lý tài khoản lễ tân */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PageQuery) {
    const where: Prisma.UserWhereInput = {
      role: 'RECEPTIONIST',
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { fullName: 'asc' }, ...skipTake(q) }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(items.map(publicUser), total, q);
  }

  async create(dto: CreateReceptionistDto) {
    if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
      throw new ConflictException('Số điện thoại đã được dùng cho tài khoản khác');
    }
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        role: 'RECEPTIONIST',
      },
    });
    return publicUser(user);
  }

  async update(id: string, dto: UpdateReceptionistDto) {
    const user = await this.prisma.user.findFirst({ where: { id, role: 'RECEPTIONIST' } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản lễ tân');
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        isActive: dto.isActive,
        ...(dto.password ? { passwordHash: await hashPassword(dto.password) } : {}),
      },
    });
    return publicUser(updated);
  }
}

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

@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
