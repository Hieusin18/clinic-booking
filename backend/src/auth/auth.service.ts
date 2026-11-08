import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { phoneVerificationRequired, PhoneVerifyService } from '../sms/phone-verify.js';
import { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto.js';
import { AuthUser } from './decorators.js';
import { hashPassword, passwordProblem, verifyPassword } from './password.js';

/** Nhập sai bấy nhiêu lần liên tiếp thì tạm khóa tài khoản */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
/** Mỗi địa chỉ IP được nhập sai tối đa bấy nhiêu lần trong LOCK_MINUTES (chống thử mật khẩu trên nhiều tài khoản) */
export const MAX_FAILED_PER_IP = 30;
const BAD_LOGIN = 'Sai số điện thoại hoặc mật khẩu';

/** Thông tin tài khoản trả về cho client (không bao giờ kèm passwordHash). */
export function publicUser(u: User) {
  return { id: u.id, fullName: u.fullName, phone: u.phone, email: u.email, role: u.role, isActive: u.isActive, mustChangePassword: u.mustChangePassword };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly phoneVerify: PhoneVerifyService,
  ) {}

  /**
   * Bệnh nhân tự đăng ký. Nếu lễ tân đã tạo hồ sơ với cùng SĐT (chưa có tài khoản)
   * thì gắn tài khoản mới vào hồ sơ đó để bệnh nhân thấy lịch sử khám cũ.
   */
  async register(dto: RegisterDto) {
    const weak = passwordProblem(dto.password, dto.phone);
    if (weak) throw new BadRequestException(weak);
    if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
      throw new ConflictException('Số điện thoại đã được đăng ký');
    }
    const passwordHash = await hashPassword(dto.password);
    const verification = dto.verificationId && dto.ticket ? { verificationId: dto.verificationId, ticket: dto.ticket } : undefined;
    const mustVerify = phoneVerificationRequired();

    const user = await this.prisma.$transaction(async (tx) => {
      // Số điện thoại phải được chứng minh bằng tin nhắn gửi từ chính SIM đó (sms/phone-verify.ts)
      const phoneProven = mustVerify || verification ? (await this.phoneVerify.consume(tx, verification, 'REGISTER', dto.phone), true) : false;
      const created = await tx.user.create({
        data: { fullName: dto.fullName, phone: dto.phone, email: dto.email, passwordHash, role: 'PATIENT' },
      });
      const existing = await tx.patient.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        if (existing.userId) throw new ConflictException('Số điện thoại đã được đăng ký');
        // Hồ sơ có sẵn (lễ tân tạo khi khám vãng lai). Đã chứng minh giữ số điện thoại (nhắn tin xác minh) thì
        // thấy ngay lịch sử khám; chưa thì ẩn bệnh án cũ cho tới khi xác minh bằng mã liên kết / tại quầy
        // (patients/account-link.ts)
        await tx.patient.update({
          where: { id: existing.id },
          data: phoneProven
            ? { userId: created.id, historyLockedBefore: null, verifiedAt: new Date(), verifyFailures: 0 }
            : { userId: created.id, historyLockedBefore: new Date(), verifyFailures: 0 },
        });
      } else {
        await tx.patient.create({
          data: {
            userId: created.id,
            fullName: dto.fullName,
            phone: dto.phone,
            dateOfBirth: new Date(dto.dateOfBirth),
            gender: dto.gender,
          },
        });
      }
      return created;
    });

    return this.issueToken(user);
  }

  /** Lần nhập sai gần đây theo địa chỉ IP (trong bộ nhớ; khởi động lại máy chủ thì xóa) */
  private readonly failedByIp = new Map<string, number[]>();

  private ipBlocked(ip: string, now: number) {
    const recent = (this.failedByIp.get(ip) ?? []).filter((t) => now - t < LOCK_MINUTES * 60_000);
    this.failedByIp.set(ip, recent);
    return recent.length >= MAX_FAILED_PER_IP;
  }

  /**
   * Đăng nhập. Chống dò mật khẩu: sai 5 lần liên tiếp thì tài khoản tạm khóa 15 phút (kể cả nhập đúng
   * trong lúc khóa); một địa chỉ IP sai quá 30 lần trong 15 phút thì bị chặn.
   */
  async login(dto: LoginDto, ip = 'unknown', now = new Date()) {
    const tooMany = (minutes: number) =>
      new HttpException(`Nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`, HttpStatus.TOO_MANY_REQUESTS);
    if (this.ipBlocked(ip, now.getTime())) throw tooMany(LOCK_MINUTES);

    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (user?.lockedUntil && user.lockedUntil > now) {
      throw tooMany(Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000));
    }
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      this.failedByIp.get(ip)!.push(now.getTime());
      if (user) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await this.prisma.user.update({
          where: { id: user.id },
          data: lock ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
        });
        if (lock) {
          throw new HttpException(
            `Nhập sai mật khẩu ${MAX_FAILED_LOGINS} lần. Tài khoản tạm khóa ${LOCK_MINUTES} phút; quên mật khẩu hãy liên hệ quản trị viên.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      throw new UnauthorizedException(BAD_LOGIN);
    }
    if (!user.isActive) throw new UnauthorizedException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now } });
    return this.issueToken(updated);
  }

  /**
   * Đổi mật khẩu (mọi vai trò, kể cả khi đang dùng mật khẩu tạm). Các máy khác đang đăng nhập bị đăng xuất;
   * máy đang dùng nhận token mới để tiếp tục.
   */
  async changePassword(auth: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) throw new BadRequestException('Mật khẩu hiện tại không đúng');
    if (dto.newPassword === dto.currentPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    const weak = passwordProblem(dto.newPassword, user.phone);
    if (weak) throw new BadRequestException(weak);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    return this.issueToken(updated);
  }

  /**
   * Quên mật khẩu (bệnh nhân): đã nhắn tin xác minh số điện thoại thì đặt mật khẩu mới, mọi máy đang đăng nhập
   * bị đăng xuất, tạm khóa do nhập sai được gỡ; trả token để đăng nhập luôn.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const v = await this.prisma.phoneVerification.findUnique({ where: { id: dto.verificationId }, select: { phone: true } });
    const user = v && (await this.prisma.user.findUnique({ where: { phone: v.phone } }));
    if (!v || !user || user.role !== 'PATIENT') throw new BadRequestException('Phiên xác minh không hợp lệ, vui lòng xác minh lại');
    const weak = passwordProblem(dto.newPassword, user.phone);
    if (weak) throw new BadRequestException(weak);
    const passwordHash = await hashPassword(dto.newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.phoneVerify.consume(tx, dto, 'RESET_PASSWORD', user.phone);
      return tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
      });
    });
    if (!updated.isActive) throw new UnauthorizedException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
    return this.issueToken(updated);
  }

  /** Đăng xuất khỏi mọi thiết bị (kể cả máy đang dùng). */
  async logoutAll(auth: AuthUser) {
    await this.prisma.user.update({ where: { id: auth.sub }, data: { tokenVersion: { increment: 1 } } });
    return { ok: true };
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.sub },
      include: { patient: true, doctor: { include: { specialty: true } } },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return { ...publicUser(user), patient: user.patient, doctor: user.doctor };
  }

  private async issueToken(user: User) {
    const payload: AuthUser = { sub: user.id, role: user.role, ver: user.tokenVersion };
    return { accessToken: await this.jwt.signAsync(payload), user: publicUser(user) };
  }
}
