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
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { SessionsService } from '../auth/sessions.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureLinkCode, normalizeCode } from './utils/link-code.util.js';
import { patientScopeOf } from './utils/patient-scope.util.js';

export const MAX_VERIFY_FAILURES = 5;
export const VERIFY_LOCK_MINUTES = 60;

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
