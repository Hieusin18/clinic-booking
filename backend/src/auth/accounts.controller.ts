import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { AuthUser } from './interfaces/auth-user.interface.js';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Tạo mật khẩu tạm cho bác sĩ / lễ tân (chỉ trả về một lần) */
  @Roles('ADMIN')
  @Post(':id/reset-password')
  @HttpCode(200)
  reset(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.resetPassword(admin, id);
  }
}
