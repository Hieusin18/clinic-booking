import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { NotificationType } from '../../generated/prisma/enums.js';

export const NOTIFICATION_TYPES: NotificationType[] = ['CALLED', 'RESULTS_READY', 'VISIT_DONE', 'APPOINTMENT_REMINDER'];

export class NotificationListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
