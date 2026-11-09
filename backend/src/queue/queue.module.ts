import { Module } from '@nestjs/common';
import { QueueJanitor } from './queue-janitor.service.js';
import { QueueController } from './queue.controller.js';
import { QueueService } from './queue.service.js';

@Module({ controllers: [QueueController], providers: [QueueService, QueueJanitor], exports: [QueueService] })
export class QueueModule {}
