import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module.js';
import { LabResultsController } from './lab-results.controller.js';
import { LabResultsService } from './lab-results.service.js';

@Module({ imports: [VisitsModule], controllers: [LabResultsController], providers: [LabResultsService] })
export class LabResultsModule {}
