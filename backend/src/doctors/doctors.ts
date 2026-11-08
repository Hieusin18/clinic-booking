import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '../auth/auth.dto.js';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/decorators.js';
import { hashPassword } from '../auth/password.js';
import { PageQuery, skipTake, toPage } from '../common/pagination.js';
import { todayVN } from '../common/time.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AVATAR_MAX_BYTES,
  checkYears,
  detectImage,
  experienceYears,
  joinExpertise,
  newestFirst,
  splitExpertise,
  type HistoryEntry,
} from './doctor-profile.js';

export class HistoryEntryDto implements HistoryEntry {
  @Type(() => Number) @IsInt() @Min(1950) @Max(2100) fromYear: number;
  /** Bỏ trống hoặc null = đến nay */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) toYear?: number | null;
  /** Chức vụ, vị trí (công tác) hoặc văn bằng (đào tạo) */
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  /** Nơi công tác hoặc cơ sở đào tạo */
  @IsString() @MinLength(2) @MaxLength(200) place: string;
}

/** Phần hồ sơ hiện cho bệnh nhân; bác sĩ tự sửa được, admin cũng sửa được. */
export class ProfileDto {
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  /** Năm bắt đầu hành nghề; null = xóa */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) practiceSince?: number | null;
  /** Thế mạnh chuyên môn */
  @IsOptional() @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) @MaxLength(100, { each: true }) expertise?: string[];
  /** Quá trình đào tạo; gửi lên = thay toàn bộ danh sách cũ */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => HistoryEntryDto) education?: HistoryEntryDto[];
  /** Quá trình công tác đến nay; gửi lên = thay toàn bộ danh sách cũ */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => HistoryEntryDto) career?: HistoryEntryDto[];
}

export class CreateDoctorDto {
  @IsString() @MinLength(2) fullName: string;
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' }) password: string;
  @IsString() specialtyId: string;
  /** Học hàm, học vị: "ThS.BS", "BSCKII"… */
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  /** Phòng khám, ví dụ "Phòng 2" */
  @IsOptional() @IsString() @MaxLength(40) room?: string;
}

export class UpdateDoctorDto extends ProfileDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsString() specialtyId?: string;
  @IsOptional() @IsString() title?: string;
  /** Phòng khám, ví dụ "Phòng 2"; chuỗi rỗng = xóa */
  @IsOptional() @IsString() @MaxLength(40) room?: string;
  /** false = khóa tài khoản, bác sĩ không đăng nhập được và không hiện cho bệnh nhân */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DoctorQuery extends PageQuery {
  @IsOptional() @IsString() specialtyId?: string;
}

/** Thông tin công khai: không có SĐT, email (API danh sách bác sĩ không cần đăng nhập). */
const publicView = {
  id: true,
  title: true,
  bio: true,
  room: true,
  practiceSince: true,
  expertise: true,
  specialty: { select: { id: true, name: true } },
  user: { select: { fullName: true } },
  avatar: { select: { updatedAt: true } },
} satisfies Prisma.DoctorSelect;

/** Admin thấy thêm tài khoản đăng nhập. */
const adminView = {
  ...publicView,
  user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true } },
} satisfies Prisma.DoctorSelect;

const historyView = { select: { id: true, kind: true, fromYear: true, toYear: true, title: true, place: true } } as const;

type Row = Prisma.DoctorGetPayload<{ select: typeof publicView }>;
type HistoryRow = { id: string; kind: 'EDUCATION' | 'WORK'; fromYear: number; toYear: number | null; title: string; place: string };

/** Đổi dữ liệu lưu trữ sang dạng API: thế mạnh thành mảng, ảnh thành số phiên bản để tránh cache cũ. */
function present<T extends Row>({ avatar, expertise, ...d }: T, now = new Date()) {
  return {
    ...d,
    expertise: splitExpertise(expertise),
    experienceYears: experienceYears(d.practiceSince, now),
    /** Thời điểm cập nhật ảnh (ms); null = chưa có ảnh. Ảnh ở GET /doctors/:id/avatar?v=<số này> */
    avatarVersion: avatar ? avatar.updatedAt.getTime() : null,
  };
}

function withHistory<T extends Row & { history: HistoryRow[] }>({ history, ...d }: T) {
  const pick = (kind: HistoryRow['kind']) => newestFirst(history.filter((h) => h.kind === kind)).map(({ kind: _k, ...h }) => h);
  return { ...present(d), education: pick('EDUCATION'), career: pick('WORK') };
}

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bệnh nhân chỉ thấy bác sĩ đang hoạt động; admin thấy tất cả và cả tài khoản đăng nhập. */
  async list(q: DoctorQuery, forAdmin = false) {
    const userWhere: Prisma.UserWhereInput = {
      ...(forAdmin ? {} : { isActive: true }),
      ...(q.q ? { fullName: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const where: Prisma.DoctorWhereInput = {
      ...(q.specialtyId ? { specialtyId: q.specialtyId } : {}),
      ...(Object.keys(userWhere).length ? { user: userWhere } : {}),
    };
    const now = new Date();
    // Thêm cho danh sách: số chỗ còn trống hôm nay và công việc hiện tại (mốc công tác "đến nay")
    const extra = {
      _count: { select: { schedules: { where: { date: todayVN(now), isBooked: false, startTime: { gt: now } } } } },
      history: { where: { kind: 'WORK', toYear: null }, orderBy: { fromYear: 'desc' }, take: 1, select: { title: true, place: true } },
    } satisfies Prisma.DoctorSelect;
    const [items, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where,
        select: { ...(forAdmin ? adminView : publicView), ...extra },
        orderBy: { user: { fullName: 'asc' } },
        ...skipTake(q),
      }),
      this.prisma.doctor.count({ where }),
    ]);
    return toPage(
      items.map(({ _count, history, ...d }) => ({
        ...present(d, now),
        /** Số khung giờ còn trống hôm nay */
        freeToday: _count.schedules,
        /** "Chức vụ · Nơi công tác" của việc đang làm; null = chưa cập nhật */
        currentPosition: history[0] ? `${history[0].title} · ${history[0].place}` : null,
      })),
      total,
      q,
    );
  }

  /** Hồ sơ đầy đủ cho bệnh nhân xem trước khi đặt lịch (chỉ bác sĩ đang hoạt động). */
  async profile(id: string) {
    const d = await this.prisma.doctor.findFirst({ where: { id, user: { isActive: true } }, select: { ...publicView, history: historyView } });
    if (!d) throw new NotFoundException('Không tìm thấy bác sĩ');
    return withHistory(d);
  }

  /** Hồ sơ kèm tài khoản, cho admin sửa (kể cả bác sĩ đã khóa). */
  async full(id: string) {
    const d = await this.prisma.doctor.findUnique({ where: { id }, select: { ...adminView, history: historyView } });
    if (!d) throw new NotFoundException('Không tìm thấy bác sĩ');
    return withHistory(d);
  }

  async create(dto: CreateDoctorDto) {
    await this.ensureSpecialty(dto.specialtyId);
    if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
      throw new ConflictException('Số điện thoại đã được dùng cho tài khoản khác');
    }
    const d = await this.prisma.doctor.create({
      data: {
        title: dto.title,
        bio: dto.bio,
        room: dto.room?.trim() || null,
        specialty: { connect: { id: dto.specialtyId } },
        user: {
          create: {
            fullName: dto.fullName,
            phone: dto.phone,
            email: dto.email,
            passwordHash: await hashPassword(dto.password),
            role: 'DOCTOR',
            // Mật khẩu ban đầu do admin đặt: bác sĩ phải đổi ở lần đăng nhập đầu
            mustChangePassword: true,
          },
        },
      },
      select: adminView,
    });
    return present(d);
  }

  /** Admin sửa tài khoản và hồ sơ. */
  async update(id: string, dto: UpdateDoctorDto) {
    if (!(await this.prisma.doctor.findUnique({ where: { id } }))) throw new NotFoundException('Không tìm thấy bác sĩ');
    if (dto.specialtyId) await this.ensureSpecialty(dto.specialtyId);
    await this.saveProfile(id, dto, {
      title: dto.title,
      ...(dto.room === undefined ? {} : { room: dto.room.trim() || null }),
      ...(dto.specialtyId ? { specialty: { connect: { id: dto.specialtyId } } } : {}),
      user: { update: { fullName: dto.fullName, isActive: dto.isActive } },
    });
    return this.full(id);
  }

  /** Bác sĩ tự sửa phần hồ sơ (không đổi được tên, học vị, chuyên khoa, trạng thái tài khoản). */
  async updateMine(user: AuthUser, dto: ProfileDto) {
    const id = await this.doctorIdOf(user);
    await this.saveProfile(id, dto);
    return this.full(id);
  }

  async mine(user: AuthUser) {
    return this.full(await this.doctorIdOf(user));
  }

  private async saveProfile(id: string, dto: ProfileDto, extra: Prisma.DoctorUpdateInput = {}) {
    checkYears(dto.practiceSince, [...(dto.education ?? []), ...(dto.career ?? [])]);
    const replace = (kind: 'EDUCATION' | 'WORK', list?: HistoryEntryDto[]) =>
      list
        ? [
            this.prisma.doctorHistory.deleteMany({ where: { doctorId: id, kind } }),
            this.prisma.doctorHistory.createMany({
              data: list.map((e) => ({ doctorId: id, kind, fromYear: e.fromYear, toYear: e.toYear ?? null, title: e.title.trim(), place: e.place.trim() })),
            }),
          ]
        : [];
    await this.prisma.$transaction([
      this.prisma.doctor.update({
        where: { id },
        data: {
          ...extra,
          bio: dto.bio,
          practiceSince: dto.practiceSince,
          ...(dto.expertise ? { expertise: joinExpertise(dto.expertise) } : {}),
        },
      }),
      ...replace('EDUCATION', dto.education),
      ...replace('WORK', dto.career),
    ]);
  }

  async setAvatar(id: string, file: { buffer: Buffer; size: number } | undefined) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    if (file.size > AVATAR_MAX_BYTES) throw new BadRequestException('Ảnh tối đa 2 MB');
    const mimeType = detectImage(file.buffer);
    if (!mimeType) throw new BadRequestException('Ảnh phải là JPG, PNG hoặc WebP');
    if (!(await this.prisma.doctor.findUnique({ where: { id } }))) throw new NotFoundException('Không tìm thấy bác sĩ');
    const data = new Uint8Array(file.buffer);
    await this.prisma.doctorAvatar.upsert({ where: { doctorId: id }, create: { doctorId: id, data, mimeType }, update: { data, mimeType } });
    return this.full(id);
  }

  async removeAvatar(id: string) {
    await this.prisma.doctorAvatar.deleteMany({ where: { doctorId: id } });
    return this.full(id);
  }

  async avatar(id: string) {
    const a = await this.prisma.doctorAvatar.findFirst({ where: { doctorId: id, doctor: { user: { isActive: true } } } });
    if (!a) throw new NotFoundException('Bác sĩ chưa có ảnh');
    return new StreamableFile(Buffer.from(a.data), { type: a.mimeType, length: a.data.length });
  }

  async doctorIdOf(user: AuthUser) {
    const d = await this.prisma.doctor.findUnique({ where: { userId: user.sub } });
    if (!d) throw new ForbiddenException('Tài khoản không gắn với bác sĩ nào');
    return d.id;
  }

  private async ensureSpecialty(id: string) {
    if (!(await this.prisma.specialty.findUnique({ where: { id } }))) {
      throw new NotFoundException('Không tìm thấy chuyên khoa');
    }
  }
}

type Upload = { buffer: Buffer; size: number } | undefined;
/** Giới hạn của multer rộng hơn 2 MB để ảnh lớn nhận được thông báo tiếng Việt từ setAvatar */
const avatarUpload = FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

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

  /** Danh sách đầy đủ kể cả bác sĩ đã khóa, kèm tài khoản (trang admin) */
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('all')
  listAll(@Query() q: DoctorQuery) {
    return this.service.list(q, true);
  }

  /** Bác sĩ xem hồ sơ của mình */
  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  /** Bác sĩ tự sửa giới thiệu, kinh nghiệm, thế mạnh, quá trình đào tạo và công tác */
  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: ProfileDto) {
    return this.service.updateMine(user, dto);
  }

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('DOCTOR')
  @Post('me/avatar')
  @HttpCode(200)
  @UseInterceptors(avatarUpload)
  async uploadMyAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Upload) {
    return this.service.setAvatar(await this.service.doctorIdOf(user), file);
  }

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Delete('me/avatar')
  async removeMyAvatar(@CurrentUser() user: AuthUser) {
    return this.service.removeAvatar(await this.service.doctorIdOf(user));
  }

  /** Hồ sơ bác sĩ cho bệnh nhân xem trước khi đặt lịch */
  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.profile(id);
  }

  /** Ảnh đại diện; URL kèm ?v=<avatarVersion> nên được cache lâu */
  @Public()
  @Get(':id/avatar')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'")
  avatar(@Param('id') id: string) {
    return this.service.avatar(id);
  }

  /** Hồ sơ kèm tài khoản để admin sửa (kể cả bác sĩ đã khóa) */
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get(':id/full')
  full(@Param('id') id: string) {
    return this.service.full(id);
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

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('ADMIN')
  @Post(':id/avatar')
  @HttpCode(200)
  @UseInterceptors(avatarUpload)
  uploadAvatar(@Param('id') id: string, @UploadedFile() file: Upload) {
    return this.service.setAvatar(id, file);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':id/avatar')
  removeAvatar(@Param('id') id: string) {
    return this.service.removeAvatar(id);
  }
}

@Module({ controllers: [DoctorsController], providers: [DoctorsService] })
export class DoctorsModule {}
