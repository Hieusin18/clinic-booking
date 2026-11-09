import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { registry } from './metrics.registry.js';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  @Header('Content-Type', registry.contentType)
  metrics() {
    return registry.metrics();
  }
}
