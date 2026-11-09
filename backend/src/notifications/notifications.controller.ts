import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AllowPendingPassword } from '../auth/decorators/allow-pending-password.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { MarkReadDto } from './dto/mark-read.dto.js';
import { NotificationListQuery } from './dto/notification-list-query.dto.js';
import { PushTokenDto } from './dto/push-token.dto.js';
import { RemovePushTokenDto } from './dto/remove-push-token.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Roles('PATIENT')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: NotificationListQuery) {
    return this.service.mine(user, q.limit);
  }

  @Roles('PATIENT')
  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto) {
    return this.service.markRead(user, dto);
  }

  @Roles('PATIENT')
  @Post('push-token')
  @HttpCode(200)
  register(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.service.registerToken(user, dto);
  }

  @AllowPendingPassword()
  @Post('push-token/remove')
  @HttpCode(200)
  remove(@CurrentUser() user: AuthUser, @Body() dto: RemovePushTokenDto) {
    return this.service.removeToken(user, dto.token);
  }
}
