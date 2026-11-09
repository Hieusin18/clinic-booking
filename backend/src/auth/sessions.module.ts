import { Global, Module } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

@Global()
@Module({ providers: [SessionsService], exports: [SessionsService] })
export class SessionsModule {}
