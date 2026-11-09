import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { PageQuery } from '../common/dto/page-query.dto.js';
import { skipTake, toPage } from '../common/utils/pagination.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto.js';
import { UpdatePatientDto } from './dto/update-patient.dto.js';
import { selfPatientView } from './utils/patient-scope.util.js';

/** Chuyển ngày dạng chuỗi sang giá trị cột @db.Date. */
function toData<T extends { dateOfBirth?: string; insuranceExpiry?: string }>(dto: T) {
  return {
    ...dto,
    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
  };
}

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
          OR: [{ phone: { contains: term } }, { nationalId: { contains: term } }, { fullName: { contains: term, mode: 'insensitive' } }],
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
   * Hồ sơ của bệnh nhân đang đăng nhập. Hồ sơ có sẵn mà tài khoản chưa xác minh (xem account-link.service.ts)
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
