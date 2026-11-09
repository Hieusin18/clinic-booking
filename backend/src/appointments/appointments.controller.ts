import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AppointmentsService } from './appointments.service.js';
import { BookAppointmentDto } from './dto/book-appointment.dto.js';
import { DayQuery } from './dto/day-query.dto.js';
import { MyAppointmentsQuery } from './dto/my-appointments-query.dto.js';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Roles('PATIENT')
  @Post()
  book(@CurrentUser() user: AuthUser, @Body() dto: BookAppointmentDto) {
    return this.service.book(user, dto);
  }

  @Roles('PATIENT')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: MyAppointmentsQuery) {
    return this.service.mine(user, q);
  }

  /** Số lần không đến gần đây và hạn khóa đặt lịch online */
  @Roles('PATIENT')
  @Get('standing')
  standing(@CurrentUser() user: AuthUser) {
    return this.service.myStanding(user);
  }

  @Roles('PATIENT')
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Get()
  byDay(@Query() q: DayQuery) {
    return this.service.byDay(q);
  }
}
