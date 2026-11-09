import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { StatsRangeQuery } from './dto/stats-range-query.dto.js';
import { StatsService } from './stats.service.js';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Roles('ADMIN')
  @Get('overview')
  overview(@Query() q: StatsRangeQuery) {
    return this.stats.overview(q.from, q.to);
  }
}
