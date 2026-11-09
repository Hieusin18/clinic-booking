import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionsService } from '../auth/sessions.service.js';
import { hashPassword, passwordProblem } from '../auth/utils/password.util.js';
import { publicUser } from '../auth/utils/public-user.util.js';
import { PageQuery } from '../common/dto/page-query.dto.js';
import { skipTake, toPage } from '../common/utils/pagination.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReceptionistDto } from './dto/create-receptionist.dto.js';
import { UpdateReceptionistDto } from './dto/update-receptionist.dto.js';

/** Admin quản lý tài khoản lễ tân */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

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
    const weak = passwordProblem(dto.password, dto.phone);
    if (weak) throw new BadRequestException(weak);
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
        // Mật khẩu ban đầu do admin đặt: người dùng phải đổi ở lần đăng nhập đầu
        mustChangePassword: true,
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
      },
    });
    // Khóa tài khoản: máy đang mở không còn nhận cập nhật realtime
    if (dto.isActive === false) await this.sessions.revoke(id);
    return publicUser(updated);
  }
}
