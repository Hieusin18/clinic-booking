import { Global, Module } from '@nestjs/common';
import { AppointmentReminder } from './appointment-reminder.service.js';
import { ExpoPushClient } from './expo-push.client.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [ExpoPushClient, NotificationsService, AppointmentReminder],
  exports: [NotificationsService],
})
export class NotificationsModule {}
