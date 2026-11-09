import { Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../auth/auth.dto.js';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { PageQuery, skipTake, toPage } from '../common/pagination.js';
import { Gender } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountLinkController, AccountLinkService, selfPatientView } from './account-link.js';

export class CreatePatientDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  /** YYYY-MM-DD */
  @IsDateString() dateOfBirth: string;
  @IsEnum(Gender) gender: Gender;
  /** Số CCCD, 12 chữ số */
  @IsOptional() @Matches(/^\d{12}$/, { message: 'Số CCCD phải gồm 12 chữ số' }) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  /** Mã thẻ BHYT */
  @IsOptional() @IsString() @MaxLength(20) insuranceNo?: string;
  /** Hạn dùng thẻ BHYT, YYYY-MM-DD */
  @IsOptional() @IsDateString() insuranceExpiry?: string;
  /** Tiền sử dị ứng (thuốc, thức ăn…) */
  @IsOptional() @IsString() @MaxLength(500) allergies?: string;
  @IsOptional() @IsString() @MaxLength(100) occupation?: string;
  @IsOptional() @IsString() @MaxLength(50) ethnicity?: string;
  /** Người nhà cần báo tin; với trẻ em là người đưa trẻ đến khám */
  @IsOptional() @IsString() @MaxLength(100) relativeName?: string;
  @IsOptional() @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) relativePhone?: string;
}

/** Chuyển ngày dạng chuỗi sang giá trị cột @db.Date. */
function toData<T extends { dateOfBirth?: string; insuranceExpiry?: string }>(dto: T) {
  return {
    ...dto,
    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
  };
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

/** Bệnh nhân tự sửa hồ sơ: không đổi SĐT vì SĐT là tên đăng nhập. */
export class UpdateMyProfileDto extends PartialType(OmitType(CreatePatientDto, ['phone'] as const)) {}

/** Thông tin hành chính, không bao gồm bệnh án (lễ tân được xem). */
const patientView = {
  id: true,
  fullName: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  nationalId: true,
  address: true,
  insuranceNo: true,
  insuranceExpiry: true,
  allergies: true,
  occupation: true,
  ethnicity: true,
  relativeName: true,
  relativePhone: true,
  createdAt: true,
  userId: true,
} satisfies Prisma.PatientSelect;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lễ tân tìm theo SĐT, CCCD hoặc tên. */
  async search(q: PageQuery) {
    const term = q.q?.trim();
    const where: Prisma.PatientWhereInput = term
      ? {
          OR: [
            { phone: { contains: term } },
            { nationalId: { contains: term } },
            { fullName: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: patientView, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.patient.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(id: string) {
    const p = await this.prisma.patient.findUnique({ where: { id }, select: patientView });
    if (!p) throw new NotFoundException('Không tìm thấy hồ sơ bệnh nhân');
    return p;
  }

  async create(dto: CreatePatientDto) {
    await this.ensureUnique(dto.phone, dto.nationalId);
    return this.prisma.patient.create({
      data: { ...toData(dto), dateOfBirth: new Date(dto.dateOfBirth) },
      select: patientView,
    });
  }

  async update(id: string, dto: UpdatePatientDto) {
    const current = await this.get(id);
    if (dto.phone && current.userId && dto.phone !== current.phone) {
      throw new ConflictException('Bệnh nhân đã có tài khoản app, không đổi được SĐT');
    }
    await this.ensureUnique(dto.phone, dto.nationalId, id);
    return this.prisma.patient.update({
      where: { id },
      data: toData(dto),
      select: patientView,
    });
  }

  /**
   * Hồ sơ của bệnh nhân đang đăng nhập. Hồ sơ có sẵn mà tài khoản chưa xác minh (xem account-link.ts)
   * thì che các thông tin lễ tân đã nhập.
   */
  async mine(user: AuthUser) {
    const p = await this.prisma.patient.findUnique({ where: { userId: user.sub }, select: { ...patientView, historyLockedBefore: true } });
    if (!p) throw new NotFoundException('Tài khoản chưa có hồ sơ bệnh nhân');
    return selfPatientView(p);
  }

  async updateMine(user: AuthUser, dto: UpdateMyProfileDto) {
    const p = await this.mine(user);
    // Chưa xác minh: không cho sửa hồ sơ có sẵn (tránh người lạ ghi đè dị ứng, BHYT… của chính chủ)
    if (!p.verified) throw new ForbiddenException('Hãy xác minh hồ sơ (nhập mã liên kết hoặc nhờ lễ tân) trước khi sửa thông tin');
    return this.update(p.id, dto);
  }

  private async ensureUnique(phone?: string, nationalId?: string, exceptId?: string) {
    if (phone) {
      const dup = await this.prisma.patient.findUnique({ where: { phone } });
      if (dup && dup.id !== exceptId) throw new ConflictException('SĐT đã có hồ sơ bệnh nhân');
    }
    if (nationalId) {
      const dup = await this.prisma.patient.findUnique({ where: { nationalId } });
      if (dup && dup.id !== exceptId) throw new ConflictException('Số CCCD đã có hồ sơ bệnh nhân');
    }
  }
}

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly service: PatientsService) {}

  /** Hồ sơ của chính bệnh nhân đang đăng nhập */
  @Roles('PATIENT')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  @Roles('PATIENT')
  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateMyProfileDto) {
    return this.service.updateMine(user, dto);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Get()
  search(@Query() q: PageQuery) {
    return this.service.search(q);
  }

  @Roles('RECEPTIONIST', 'ADMIN', 'DOCTOR')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.service.create(dto);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.service.update(id, dto);
  }
}

@Module({ controllers: [PatientsController, AccountLinkController], providers: [PatientsService, AccountLinkService] })
export class PatientsModule {}
