import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { SessionsService } from '../auth/sessions.service.js';
import { hashPassword, passwordProblem } from '../auth/utils/password.util.js';
import { skipTake, toPage } from '../common/utils/pagination.util.js';
import { todayVN } from '../common/utils/time.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { DoctorProfileDto } from './dto/doctor-profile.dto.js';
import { DoctorQuery } from './dto/doctor-query.dto.js';
import { HistoryEntryDto } from './dto/history-entry.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';
import { AVATAR_MAX_BYTES, checkYears, detectImage, experienceYears, joinExpertise, newestFirst, splitExpertise } from './utils/doctor-profile.util.js';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

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
    const weak = passwordProblem(dto.password, dto.phone);
    if (weak) throw new BadRequestException(weak);
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
    const doctor = await this.prisma.doctor.findUnique({ where: { id }, select: { userId: true } });
    if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ');
    if (dto.specialtyId) await this.ensureSpecialty(dto.specialtyId);
    await this.saveProfile(id, dto, {
      title: dto.title,
      ...(dto.room === undefined ? {} : { room: dto.room.trim() || null }),
      ...(dto.specialtyId ? { specialty: { connect: { id: dto.specialtyId } } } : {}),
      user: { update: { fullName: dto.fullName, isActive: dto.isActive } },
    });
    // Khóa tài khoản: máy đang mở không còn nhận cập nhật realtime
    if (dto.isActive === false) await this.sessions.revoke(doctor.userId);
    return this.full(id);
  }

  /** Bác sĩ tự sửa phần hồ sơ (không đổi được tên, học vị, chuyên khoa, trạng thái tài khoản). */
  async updateMine(user: AuthUser, dto: DoctorProfileDto) {
    const id = await this.doctorIdOf(user);
    await this.saveProfile(id, dto);
    return this.full(id);
  }

  async mine(user: AuthUser) {
    return this.full(await this.doctorIdOf(user));
  }

  private async saveProfile(id: string, dto: DoctorProfileDto, extra: Prisma.DoctorUpdateInput = {}) {
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
