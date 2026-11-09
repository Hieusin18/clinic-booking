import { Module } from '@nestjs/common';
import { MedicinesController } from './medicines.controller.js';
import { MedicinesService } from './medicines.service.js';

@Module({ controllers: [MedicinesController], providers: [MedicinesService] })
export class MedicinesModule {}
