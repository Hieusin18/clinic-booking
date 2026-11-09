import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { AllowPendingPassword } from './decorators/allow-pending-password.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AuthUser } from './interfaces/auth-user.interface.js';

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

  /** Quên mật khẩu: đặt mật khẩu mới sau khi nhắn tin xác minh số điện thoại */
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
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
