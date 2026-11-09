import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AvailabilityQuery } from './dto/availability-query.dto.js';
import { CreateSlotsDto } from './dto/create-slots.dto.js';
import { RangeQuery } from './dto/range-query.dto.js';
import { SlotQuery } from './dto/slot-query.dto.js';
import { SchedulesService } from './schedules.service.js';

@ApiTags('schedules')
@Controller()
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Post('schedules/bulk')
  createSlots(@CurrentUser() user: AuthUser, @Body() dto: CreateSlotsDto) {
    return this.service.createSlots(user, dto);
  }

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Get('schedules/mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    return this.service.mine(user, q);
  }

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Delete('schedules/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  /** Số giờ trống từng ngày trong 7 ngày tới (trang hồ sơ bác sĩ) */
  @Public()
  @Get('doctors/:id/availability')
  availability(@Param('id') id: string, @Query() q: AvailabilityQuery) {
    return this.service.availability(id, q);
  }

  @Public()
  @Get('doctors/:id/schedules')
  available(@Param('id') id: string, @Query() q: SlotQuery) {
    return this.service.available(id, q);
  }
}
