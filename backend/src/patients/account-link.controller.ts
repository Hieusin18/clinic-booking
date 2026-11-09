import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccountLinkService } from './account-link.service.js';
import { VerifyLinkCodeDto } from './dto/verify-link-code.dto.js';

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
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyLinkCodeDto) {
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
