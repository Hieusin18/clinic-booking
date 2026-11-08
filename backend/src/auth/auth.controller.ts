import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { AllowPendingPassword, AuthUser, CurrentUser, Public } from './decorators.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Bệnh nhân tự đăng ký tài khoản trên app */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** Đăng nhập cho cả 4 vai trò, trả về JWT */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  /** Thông tin tài khoản đang đăng nhập, kèm hồ sơ bệnh nhân hoặc bác sĩ */
  @ApiBearerAuth()
  @AllowPendingPassword()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  /** Đổi mật khẩu; trả về token mới (các máy khác bị đăng xuất) */
  @ApiBearerAuth()
  @AllowPendingPassword()
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  /** Đăng xuất khỏi mọi thiết bị */
  @ApiBearerAuth()
  @AllowPendingPassword()
  @Post('logout-all')
  @HttpCode(200)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user);
  }
}
