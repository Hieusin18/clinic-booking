/**
 * Liên kết tài khoản app với hồ sơ bệnh nhân có sẵn (lễ tân đã tạo khi khám vãng lai).
 *
 * Vấn đề: hồ sơ có sẵn đã có bệnh án. Nếu đăng ký bằng số điện thoại là xem được ngay thì ai biết số
 * điện thoại cũng đọc được bệnh án người khác. Nên khi tài khoản mới gắn vào hồ sơ có sẵn:
 *  - tài khoản dùng được ngay (đặt lịch, lấy số, khám mới), nhưng lượt khám / lịch hẹn có từ trước bị ẩn
 *    và thông tin cá nhân lễ tân đã nhập (CCCD, BHYT, địa chỉ, dị ứng…) bị che, không sửa được;
 *  - chứng minh là chính chủ bằng thứ chỉ chính chủ có: mã liên kết in trên phiếu khám / bệnh án,
 *    hoặc lễ tân đối chiếu CCCD tại quầy;
 *  - kẻ chiếm số trước không xác minh được; chính chủ ra quầy thì lễ tân gỡ tài khoản đó để chính chủ đăng ký.
 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { randomInt } from 'node:crypto';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { SessionsService } from '../auth/sessions.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Bỏ các ký tự dễ nhầm (0/O, 1/I/L) vì bệnh nhân gõ lại từ giấy */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 6;
export const MAX_VERIFY_FAILURES = 5;
export const VERIFY_LOCK_MINUTES = 60;

type Db = Pick<PrismaClient, 'patient'>;

export const newLinkCode = () => Array.from({ length: LINK_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Chuẩn hóa mã bệnh nhân gõ: bỏ khoảng trắng / gạch, viết hoa */
export const normalizeCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();

/** Mã liên kết của hồ sơ (tạo nếu chưa có). Chỉ trả cho nhân viên và bản in của bác sĩ, không trả qua API của bệnh nhân. */
export async function ensureLinkCode(db: Db, patientId: string): Promise<string> {
  const p = await db.patient.findUnique({ where: { id: patientId }, select: { linkCode: true } });
  if (!p) throw new NotFoundException('Không tìm thấy bệnh nhân');
  if (p.linkCode) return p.linkCode;
  for (let attempt = 0; ; attempt++) {
    const code = newLinkCode();
    try {
      // Chỉ ghi nếu vẫn chưa có (hai yêu cầu cùng lúc không tạo hai mã)
      const r = await db.patient.updateMany({ where: { id: patientId, linkCode: null }, data: { linkCode: code } });
      if (r.count === 1) return code;
      return (await db.patient.findUniqueOrThrow({ where: { id: patientId }, select: { linkCode: true } })).linkCode!;
    } catch (e) {
      // Trùng mã với hồ sơ khác (rất hiếm): thử mã khác
      if (attempt >= 5) throw e;
    }
  }
}

/**
 * Hồ sơ của tài khoản bệnh nhân đang đăng nhập, kèm mốc ẩn dữ liệu cũ (null = thấy hết).
 * Dùng `visibleSince(scope.lockedBefore)` trong điều kiện truy vấn lượt khám / lịch hẹn của bệnh nhân.
 */
export async function patientScopeOf(prisma: PrismaService, user: AuthUser) {
  const p = await prisma.patient.findUnique({ where: { userId: user.sub }, select: { id: true, historyLockedBefore: true } });
  if (!p) throw new ForbiddenException('Tài khoản chưa có hồ sơ bệnh nhân');
  return { patientId: p.id, lockedBefore: p.historyLockedBefore };
}

/** Điều kiện chỉ lấy bản ghi tạo từ lúc tài khoản gắn vào hồ sơ (khi hồ sơ chưa xác minh) */
export const visibleSince = (lockedBefore: Date | null) => (lockedBefore ? { createdAt: { gte: lockedBefore } } : {});

/** Thông tin cá nhân lễ tân đã nhập, bị che khi hồ sơ chưa xác minh */
export const PRIVATE_FIELDS = [
  'nationalId',
  'address',
  'insuranceNo',
  'insuranceExpiry',
  'allergies',
  'occupation',
  'ethnicity',
  'relativeName',
  'relativePhone',
] as const;

/**
 * Hồ sơ trả cho chính bệnh nhân: bỏ mã liên kết và các cột nội bộ; hồ sơ có sẵn chưa xác minh thì che thông tin
 * cá nhân lễ tân đã nhập. Không có mã liên kết ở đây là điều kiện để kẻ chiếm số không tự xác minh được.
 */
export function selfPatientView<
  P extends { historyLockedBefore: Date | null; linkCode?: string | null; verifyFailures?: number; verifyLockedUntil?: Date | null },
>(p: P) {
  const { historyLockedBefore, linkCode: _code, verifyFailures: _f, verifyLockedUntil: _l, ...rest } = p;
  if (!historyLockedBefore) return { ...rest, verified: true };
  return { ...rest, ...Object.fromEntries(PRIVATE_FIELDS.map((f) => [f, null])), verified: false };
}

class VerifyDto {
  @IsString() @Length(4, 20) code: string;
}

@Injectable()
export class AccountLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  /** Bệnh nhân: tình trạng liên kết (số lượt khám đang bị ẩn) */
  async myStatus(user: AuthUser) {
    const { patientId, lockedBefore } = await patientScopeOf(this.prisma, user);
    const hiddenVisits = lockedBefore ? await this.prisma.visit.count({ where: { patientId, createdAt: { lt: lockedBefore } } }) : 0;
    return { verified: !lockedBefore, hiddenVisits };
  }

  /** Bệnh nhân nhập mã liên kết in trên phiếu khám / bệnh án. Sai 5 lần thì khóa 60 phút. */
  async verifyWithCode(user: AuthUser, rawCode: string, now = new Date()) {
    const p = await this.prisma.patient.findUnique({ where: { userId: user.sub } });
    if (!p) throw new ForbiddenException('Tài khoản chưa có hồ sơ bệnh nhân');
    if (!p.historyLockedBefore) return { verified: true, hiddenVisits: 0 };
    if (p.verifyLockedUntil && p.verifyLockedUntil > now) {
      const minutes = Math.ceil((p.verifyLockedUntil.getTime() - now.getTime()) / 60_000);
      throw new HttpException(`Nhập sai mã quá nhiều lần. Thử lại sau ${minutes} phút hoặc nhờ lễ tân xác minh.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!p.linkCode || normalizeCode(rawCode) !== p.linkCode) {
      const failures = p.verifyFailures + 1;
      const lock = failures >= MAX_VERIFY_FAILURES;
      await this.prisma.patient.update({
        where: { id: p.id },
        data: lock ? { verifyFailures: 0, verifyLockedUntil: new Date(now.getTime() + VERIFY_LOCK_MINUTES * 60_000) } : { verifyFailures: failures },
      });
      throw new BadRequestException(
        lock ? `Mã không đúng. Bạn đã nhập sai ${MAX_VERIFY_FAILURES} lần, thử lại sau ${VERIFY_LOCK_MINUTES} phút.` : 'Mã liên kết không đúng',
      );
    }
    await this.markVerified(p.id, now);
    return { verified: true, hiddenVisits: 0 };
  }

  private markVerified(patientId: string, now = new Date()) {
    return this.prisma.patient.update({
      where: { id: patientId },
      data: { historyLockedBefore: null, verifiedAt: now, verifyFailures: 0, verifyLockedUntil: null },
    });
  }

  /** Lễ tân: tình trạng tài khoản app của hồ sơ, kèm mã liên kết để đưa / in cho bệnh nhân */
  async accountOf(patientId: string) {
    const p = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, historyLockedBefore: true, verifiedAt: true, user: { select: { phone: true, createdAt: true, isActive: true } } },
    });
    if (!p) throw new NotFoundException('Không tìm thấy bệnh nhân');
    const linkCode = await ensureLinkCode(this.prisma, patientId);
    const status = !p.user ? 'NONE' : p.historyLockedBefore ? 'UNVERIFIED' : 'VERIFIED';
    return { status, linkCode, registeredAt: p.user?.createdAt ?? null, verifiedAt: p.verifiedAt };
  }

  /** Lễ tân xác minh sau khi đối chiếu CCCD tại quầy */
  async verifyAtCounter(patientId: string) {
    const p = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { userId: true } });
    if (!p) throw new NotFoundException('Không tìm thấy bệnh nhân');
    if (!p.userId) throw new ConflictException('Bệnh nhân chưa có tài khoản app');
    await this.markVerified(patientId);
    return this.accountOf(patientId);
  }

  /**
   * Lễ tân gỡ tài khoản lạ (người khác đăng ký trước bằng số của bệnh nhân): khóa tài khoản đó, trả số điện thoại
   * về trống để chính chủ đăng ký. Chỉ gỡ được tài khoản chưa xác minh.
   */
  async detach(patientId: string) {
    const p = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { userId: true, historyLockedBefore: true } });
    if (!p) throw new NotFoundException('Không tìm thấy bệnh nhân');
    if (!p.userId) throw new ConflictException('Bệnh nhân chưa có tài khoản app');
    if (!p.historyLockedBefore) throw new ConflictException('Tài khoản đã được xác minh là chính chủ, không gỡ được');
    const userId = p.userId;
    await this.prisma.$transaction([
      this.prisma.patient.update({ where: { id: patientId }, data: { userId: null, historyLockedBefore: null, verifyFailures: 0, verifyLockedUntil: null } }),
      // Đổi số đăng nhập của tài khoản bị gỡ để số thật trống cho chính chủ; khóa và vô hiệu mọi phiên
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false, phone: `gỡ-${Date.now()}-${userId.slice(0, 8)}`, tokenVersion: { increment: 1 } },
      }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
    ]);
    await this.sessions.revoke(userId);
    return this.accountOf(patientId);
  }
}

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class AccountLinkController {
  constructor(private readonly link: AccountLinkService) {}

  @Roles('PATIENT')
  @Get('me/link')
  myStatus(@CurrentUser() user: AuthUser) {
    return this.link.myStatus(user);
  }

  @Roles('PATIENT')
  @Post('me/verify')
  @HttpCode(200)
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyDto) {
    return this.link.verifyWithCode(user, dto.code);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Get(':id/account')
  account(@Param('id', ParseUUIDPipe) id: string) {
    return this.link.accountOf(id);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Post(':id/account/verify')
  @HttpCode(200)
  verifyAtCounter(@Param('id', ParseUUIDPipe) id: string) {
    return this.link.verifyAtCounter(id);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Post(':id/account/detach')
  @HttpCode(200)
  detach(@Param('id', ParseUUIDPipe) id: string) {
    return this.link.detach(id);
  }
}
