import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { AuthUser } from './decorators.js';
import { hashPassword, verifyPassword } from './password.js';

/** Thông tin tài khoản trả về cho client (không bao giờ kèm passwordHash). */
export function publicUser(u: User) {
  return { id: u.id, fullName: u.fullName, phone: u.phone, email: u.email, role: u.role, isActive: u.isActive };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Bệnh nhân tự đăng ký. Nếu lễ tân đã tạo hồ sơ với cùng SĐT (chưa có tài khoản)
   * thì gắn tài khoản mới vào hồ sơ đó để bệnh nhân thấy lịch sử khám cũ.
   */
  async register(dto: RegisterDto) {
    if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
      throw new ConflictException('Số điện thoại đã được đăng ký');
    }
    const passwordHash = await hashPassword(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { fullName: dto.fullName, phone: dto.phone, email: dto.email, passwordHash, role: 'PATIENT' },
      });
      const existing = await tx.patient.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        if (existing.userId) throw new ConflictException('Số điện thoại đã được đăng ký');
        await tx.patient.update({ where: { id: existing.id }, data: { userId: created.id } });
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

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Sai số điện thoại hoặc mật khẩu');
    }
    if (!user.isActive) throw new UnauthorizedException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
    return this.issueToken(user);
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
    const payload: AuthUser = { sub: user.id, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user: publicUser(user) };
  }
}
