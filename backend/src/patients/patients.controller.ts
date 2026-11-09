import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { PageQuery } from '../common/dto/page-query.dto.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto.js';
import { UpdatePatientDto } from './dto/update-patient.dto.js';
import { PatientsService } from './patients.service.js';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly service: PatientsService) {}

  /** Hồ sơ của chính bệnh nhân đang đăng nhập */
  @Roles('PATIENT')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  @Roles('PATIENT')
  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateMyProfileDto) {
    return this.service.updateMine(user, dto);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Get()
  search(@Query() q: PageQuery) {
    return this.service.search(q);
  }

  @Roles('RECEPTIONIST', 'ADMIN', 'DOCTOR')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.service.create(dto);
  }

  @Roles('RECEPTIONIST', 'ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.service.update(id, dto);
  }
}
