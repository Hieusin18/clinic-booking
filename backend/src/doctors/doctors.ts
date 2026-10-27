import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../auth/auth.dto.js';
import { Public, Roles } from '../auth/decorators.js';
import { hashPassword } from '../auth/password.js';
import { PageQuery, skipTake, toPage } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class CreateDoctorDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' }) password: string;
  @IsString() specialtyId: string;
  /** Học hàm, học vị: "ThS.BS", "BSCKII"… */
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() bio?: string;
}

export class UpdateDoctorDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsString() specialtyId?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() bio?: string;
  /** false = khóa tài khoản, bác sĩ không đăng nhập được và không hiện cho bệnh nhân */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DoctorQuery extends PageQuery {
  @IsOptional() @IsString() specialtyId?: string;
}

const doctorView = {
  id: true,
  title: true,
  bio: true,
  specialty: { select: { id: true, name: true } },
  user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true } },
} satisfies Prisma.DoctorSelect;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bệnh nhân chỉ thấy bác sĩ đang hoạt động; admin thấy tất cả (includeInactive). */
  async list(q: DoctorQuery, includeInactive = false) {
    const userWhere: Prisma.UserWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(q.q ? { fullName: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const where: Prisma.DoctorWhereInput = {
      ...(q.specialtyId ? { specialtyId: q.specialtyId } : {}),
      ...(Object.keys(userWhere).length ? { user: userWhere } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.doctor.findMany({ where, select: doctorView, orderBy: { user: { fullName: 'asc' } }, ...skipTake(q) }),
      this.prisma.doctor.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(id: string) {
    const d = await this.prisma.doctor.findUnique({ where: { id }, select: doctorView });
    if (!d) throw new NotFoundException('Không tìm thấy bác sĩ');
    return d;
  }

  async create(dto: CreateDoctorDto) {
    await this.ensureSpecialty(dto.specialtyId);
    if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
      throw new ConflictException('Số điện thoại đã được dùng cho tài khoản khác');
    }
    return this.prisma.doctor.create({
      data: {
        title: dto.title,
        bio: dto.bio,
        specialty: { connect: { id: dto.specialtyId } },
        user: {
          create: {
            fullName: dto.fullName,
            phone: dto.phone,
            email: dto.email,
            passwordHash: await hashPassword(dto.password),
            role: 'DOCTOR',
          },
        },
      },
      select: doctorView,
    });
  }

  async update(id: string, dto: UpdateDoctorDto) {
    await this.get(id);
    if (dto.specialtyId) await this.ensureSpecialty(dto.specialtyId);
    return this.prisma.doctor.update({
      where: { id },
      data: {
        title: dto.title,
        bio: dto.bio,
        ...(dto.specialtyId ? { specialty: { connect: { id: dto.specialtyId } } } : {}),
        user: { update: { fullName: dto.fullName, isActive: dto.isActive } },
      },
      select: doctorView,
    });
  }

  private async ensureSpecialty(id: string) {
    if (!(await this.prisma.specialty.findUnique({ where: { id } }))) {
      throw new NotFoundException('Không tìm thấy chuyên khoa');
    }
  }
}

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly service: DoctorsService) {}

  /** Danh sách bác sĩ đang hoạt động, lọc theo chuyên khoa (bệnh nhân dùng) */
  @Public()
  @Get()
  list(@Query() q: DoctorQuery) {
    return this.service.list(q);
  }

  /** Danh sách đầy đủ kể cả bác sĩ đã khóa (trang admin) */
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('all')
  listAll(@Query() q: DoctorQuery) {
    return this.service.list(q, true);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateDoctorDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.service.update(id, dto);
  }
}

@Module({ controllers: [DoctorsController], providers: [DoctorsService] })
export class DoctorsModule {}
