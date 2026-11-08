/**
 * Xác minh số điện thoại kiểu "nhắn tin để xác thực" (giống Zalo): thay vì phòng khám nhắn OTP đi (tốn tiền,
 * kẻ xấu bấm "gửi mã" liên tục là phòng khám mất tiền), NGƯỜI DÙNG nhắn mã từ chính SIM của họ tới số của
 * phòng khám. Bằng chứng chính chủ là SỐ NGƯỜI GỬI, mã chỉ để nối tin nhắn với đúng phiên.
 *
 *  1. App: POST /auth/phone-verifications {phone, purpose} → { id, ticket, code, smsTo, smsBody, expiresAt }
 *  2. Người dùng nhắn "PKXM <mã>" tới smsTo (app mở sẵn màn soạn tin)
 *  3. Cổng SMS chuyển tin tới POST /sms/inbound:
 *     - iPhone Phím tắt: header X-Gateway-Token = SMS_GATEWAY_TOKEN, thân {from, body}
 *     - Android SMS Gateway: chữ ký HMAC-SHA256 (X-Signature, X-Timestamp) bằng SMS_GATEWAY_SIGNING_KEY
 *  4. Mã đúng VÀ số gửi trùng số khai báo → phiên "đã xác minh"; app hỏi trạng thái (kèm ticket) rồi
 *     dùng phiên để đăng ký (POST /auth/register) hoặc đặt lại mật khẩu (POST /auth/reset-password).
 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Ip,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Public, Roles } from '../auth/decorators.js';
import type { PhoneVerifyPurpose } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MINUTE = 60_000;
/** Phiên chờ tin nhắn trong bấy nhiêu phút */
export const VERIFY_TTL_MINUTES = 10;
/** Đã xác minh thì phải dùng (đăng ký / đặt mật khẩu) trong bấy nhiêu phút */
export const USE_WITHIN_MINUTES = 30;
/** Tạo phiên: tối đa theo số điện thoại / theo IP trong một giờ (không tốn tiền nhưng tránh rác CSDL) */
export const MAX_PER_PHONE_HOUR = 10;
export const MAX_PER_IP_HOUR = 30;
/** Tiền tố trong tin nhắn (lạ để tin thường của chủ máy cổng không làm Phím tắt chạy nhầm) */
export const SMS_PREFIX = 'PKXM';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** "+84 912 345 678", "84912345678", "0912-345-678" → "0912345678"; không phải số di động VN → null */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  const local = digits.replace(/^\+?84/, '0');
  return /^0\d{9}$/.test(local) ? local : null;
}

/** Lấy mã 6 số trong tin nhắn ("PKXM 482913", "pkxm482913", hoặc chỉ "482913") */
export function codeIn(body: string): string | null {
  return /(?:^|\D)(\d{6})(?:\D|$)/.exec(body.replace(new RegExp(SMS_PREFIX, 'i'), ' '))?.[1] ?? null;
}

/** Bật / tắt yêu cầu xác minh số khi đăng ký (mặc định bật; tắt bằng REQUIRE_PHONE_VERIFICATION=false) */
export const phoneVerificationRequired = () => process.env.REQUIRE_PHONE_VERIFICATION !== 'false';

export interface UsableVerification {
  verificationId: string;
  ticket: string;
}

class StartDto {
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0' }) phone: string;
  @IsIn(['REGISTER', 'RESET_PASSWORD']) purpose: PhoneVerifyPurpose;
}

class StatusQuery {
  @IsString() @MaxLength(100) ticket: string;
}

class ListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

@Injectable()
export class PhoneVerifyService {
  private readonly log = new Logger('PhoneVerify');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Số nhận tin của phòng khám (số SIM của máy cổng) */
  get smsTo(): string | null {
    return String(this.config.get('SMS_VERIFY_NUMBER') ?? '').trim() || null;
  }

  async start(dto: StartDto, ip: string, now = new Date()) {
    const hourAgo = new Date(now.getTime() - 60 * MINUTE);
    const [byPhone, byIp] = await Promise.all([
      this.prisma.phoneVerification.count({ where: { phone: dto.phone, createdAt: { gte: hourAgo } } }),
      this.prisma.phoneVerification.count({ where: { ip, createdAt: { gte: hourAgo } } }),
    ]);
    if (byPhone >= MAX_PER_PHONE_HOUR || byIp >= MAX_PER_IP_HOUR) {
      throw new HttpException('Bạn đã yêu cầu xác minh quá nhiều lần, vui lòng thử lại sau', HttpStatus.TOO_MANY_REQUESTS);
    }
    const account = await this.prisma.user.findUnique({ where: { phone: dto.phone }, select: { role: true } });
    if (dto.purpose === 'REGISTER' && account) throw new ConflictException('Số điện thoại đã có tài khoản. Nếu quên mật khẩu, hãy chọn "Quên mật khẩu".');
    if (dto.purpose === 'RESET_PASSWORD') {
      if (!account) throw new NotFoundException('Số điện thoại này chưa có tài khoản');
      if (account.role !== 'PATIENT') throw new BadRequestException('Nhân viên quên mật khẩu vui lòng liên hệ quản trị viên');
    }

    // Mã 6 số không trùng với phiên khác đang chờ (để một tin nhắn chỉ khớp đúng một phiên)
    let code = '';
    for (let i = 0; i < 20; i++) {
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const clash = await this.prisma.phoneVerification.count({ where: { code, verifiedAt: null, expiresAt: { gt: now } } });
      if (!clash) break;
    }
    const ticket = randomBytes(24).toString('base64url');
    const v = await this.prisma.phoneVerification.create({
      data: { phone: dto.phone, purpose: dto.purpose, code, ticketHash: sha256(ticket), ip, expiresAt: new Date(now.getTime() + VERIFY_TTL_MINUTES * MINUTE) },
    });
    return { id: v.id, ticket, code, smsTo: this.smsTo, smsBody: `${SMS_PREFIX} ${code}`, expiresAt: v.expiresAt };
  }

  async status(id: string, ticket: string, now = new Date()) {
    const v = await this.prisma.phoneVerification.findUnique({ where: { id } });
    if (!v || !safeEqual(v.ticketHash, sha256(ticket))) throw new NotFoundException('Không tìm thấy phiên xác minh');
    const status = v.verifiedAt ? 'VERIFIED' : v.expiresAt <= now ? 'EXPIRED' : 'PENDING';
    return { status, phone: v.phone, expiresAt: v.expiresAt };
  }

  /**
   * Dùng một phiên đã xác minh (đăng ký / đặt lại mật khẩu): đúng vé, đúng mục đích, đúng số, chưa dùng,
   * xác minh chưa quá 30 phút. Đánh dấu đã dùng nên không dùng lại được. Chạy trong transaction của nơi gọi.
   */
  async consume(db: Pick<PrismaService, 'phoneVerification'>, v: UsableVerification | undefined, purpose: PhoneVerifyPurpose, phone: string, now = new Date()) {
    const invalid = new BadRequestException('Số điện thoại chưa được xác minh hoặc phiên xác minh đã hết hạn, vui lòng xác minh lại');
    if (!v?.verificationId || !v.ticket) throw invalid;
    const row = await db.phoneVerification.findUnique({ where: { id: v.verificationId } });
    if (
      !row ||
      !safeEqual(row.ticketHash, sha256(v.ticket)) ||
      row.purpose !== purpose ||
      row.phone !== phone ||
      !row.verifiedAt ||
      row.usedAt ||
      row.verifiedAt.getTime() < now.getTime() - USE_WITHIN_MINUTES * MINUTE
    ) {
      throw invalid;
    }
    const used = await db.phoneVerification.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (used.count !== 1) throw invalid;
  }

  /** Một tin nhắn từ cổng SMS (hoặc giả lập): khớp mã + số người gửi thì xác minh phiên tương ứng. */
  async handleInbound(source: string, fromRaw: string, body: string, now = new Date()) {
    const phone = normalizePhone(fromRaw);
    const code = codeIn(body);
    let result = 'NO_MATCH';
    let verificationId: string | null = null;
    if (!phone) {
      // Người gửi là email (iMessage) hoặc tên danh bạ: không chứng minh được số điện thoại
      result = 'INVALID_SENDER';
    } else if (code) {
      const candidates = await this.prisma.phoneVerification.findMany({ where: { code, verifiedAt: null, expiresAt: { gt: now } } });
      const match = candidates.find((c) => c.phone === phone);
      if (match) {
        await this.prisma.phoneVerification.update({ where: { id: match.id }, data: { verifiedAt: now } });
        result = 'VERIFIED';
        verificationId = match.id;
      } else if (candidates.length) {
        // Mã đúng nhưng tin gửi từ số khác: có thể ai đó đang khai số của người khác
        result = 'WRONG_SENDER';
      }
    }
    await this.prisma.inboundSms.create({
      data: { source, fromRaw: fromRaw.slice(0, 80), phone, body: body.slice(0, 320), result, verificationId, receivedAt: now },
    });
    this.log.log(`Tin nhắn ${source} từ ${phone ?? fromRaw}: ${result}`);
    return { ok: true, result };
  }

  // ---- Cho admin ----

  async recentInbound(limit = 50) {
    return this.prisma.inboundSms.findMany({ orderBy: { receivedAt: 'desc' }, take: limit });
  }

  configView() {
    return {
      smsTo: this.smsTo,
      iphoneShortcut: !!String(this.config.get('SMS_GATEWAY_TOKEN') ?? '').trim(),
      androidGateway: !!String(this.config.get('SMS_GATEWAY_SIGNING_KEY') ?? '').trim(),
      prefix: SMS_PREFIX,
    };
  }

  // ---- Xác thực cổng SMS ----

  /**
   * Tin từ cổng có thật không. iPhone Phím tắt: header X-Gateway-Token trùng SMS_GATEWAY_TOKEN.
   * Android SMS Gateway: X-Signature = HMAC-SHA256(thân gốc + X-Timestamp, SMS_GATEWAY_SIGNING_KEY), lệch ≤ 5 phút.
   * Trả về nguồn và {from, body} đã đọc ra.
   */
  authenticate(req: Request & { rawBody?: Buffer }, now = new Date()): { source: string; from: string; body: string } {
    const token = String(this.config.get('SMS_GATEWAY_TOKEN') ?? '').trim();
    const key = String(this.config.get('SMS_GATEWAY_SIGNING_KEY') ?? '').trim();
    const sig = req.header('x-signature');
    const ts = req.header('x-timestamp');
    if (sig && ts && key) {
      const raw = req.rawBody?.toString('utf8') ?? '';
      const expected = createHmac('sha256', key)
        .update(raw + ts)
        .digest('hex');
      if (!safeEqual(sig.toLowerCase(), expected) || Math.abs(now.getTime() / 1000 - Number(ts)) > 300) {
        throw new UnauthorizedException('Chữ ký cổng SMS không hợp lệ');
      }
      const payload = (req.body as { event?: string; payload?: { phoneNumber?: string; message?: string } }) ?? {};
      if (payload.event && payload.event !== 'sms:received') throw new BadRequestException('Chỉ nhận sự kiện sms:received');
      return { source: 'ANDROID_GATEWAY', from: String(payload.payload?.phoneNumber ?? ''), body: String(payload.payload?.message ?? '') };
    }
    const given = req.header('x-gateway-token');
    if (token && given && safeEqual(given, token)) {
      const b = (req.body as { from?: unknown; body?: unknown }) ?? {};
      return { source: 'IOS_SHORTCUT', from: String(b.from ?? ''), body: String(b.body ?? '') };
    }
    throw new UnauthorizedException('Cổng SMS chưa được xác thực');
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@ApiTags('auth')
@Controller('auth/phone-verifications')
export class PhoneVerifyController {
  constructor(private readonly service: PhoneVerifyService) {}

  /** Bắt đầu xác minh số: trả mã để người dùng nhắn tới số của phòng khám */
  @Public()
  @Post()
  start(@Body() dto: StartDto, @Ip() ip: string) {
    return this.service.start(dto, ip);
  }

  /** App hỏi trạng thái (mỗi 2 giây) cho tới khi VERIFIED / EXPIRED */
  @Public()
  @Get(':id')
  status(@Param('id', ParseUUIDPipe) id: string, @Query() q: StatusQuery) {
    return this.service.status(id, q.ticket);
  }
}

@ApiTags('sms')
@Controller('sms')
export class SmsController {
  constructor(private readonly service: PhoneVerifyService) {}

  /** Cổng SMS chuyển tin nhắn đến (iPhone Phím tắt / Android SMS Gateway). Luôn trả 200 khi đã xác thực. */
  @Public()
  @Post('inbound')
  @HttpCode(200)
  inbound(@Req() req: Request & { rawBody?: Buffer }) {
    const msg = this.service.authenticate(req);
    return this.service.handleInbound(msg.source, msg.from, msg.body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('inbound')
  recent(@Query() q: ListQuery) {
    return this.service.recentInbound(q.limit);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('config')
  config() {
    return this.service.configView();
  }
}

@Module({ controllers: [PhoneVerifyController, SmsController], providers: [PhoneVerifyService], exports: [PhoneVerifyService] })
export class PhoneVerifyModule {}
