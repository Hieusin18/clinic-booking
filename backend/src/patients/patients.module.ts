import { Module } from '@nestjs/common';
import { AccountLinkController } from './account-link.controller.js';
import { AccountLinkService } from './account-link.service.js';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';

@Module({ controllers: [PatientsController, AccountLinkController], providers: [PatientsService, AccountLinkService] })
export class PatientsModule {}
