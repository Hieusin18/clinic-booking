import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { AuthUser, CurrentUser, Public } from './decorators.js';

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
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Thông tin tài khoản đang đăng nhập, kèm hồ sơ bệnh nhân hoặc bác sĩ */
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
