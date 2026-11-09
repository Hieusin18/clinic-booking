import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { DoctorsService } from './doctors.service.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { DoctorProfileDto } from './dto/doctor-profile.dto.js';
import { DoctorQuery } from './dto/doctor-query.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';

type Upload = { buffer: Buffer; size: number } | undefined;

/** Giới hạn của multer rộng hơn 2 MB để ảnh lớn nhận được thông báo tiếng Việt từ setAvatar */
const avatarUpload = FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly service: DoctorsService) {}

  /** Danh sách bác sĩ đang hoạt động, lọc theo chuyên khoa (bệnh nhân dùng) */
  @Public()
  @Get()
  list(@Query() q: DoctorQuery) {
    return this.service.list(q);
  }

  /** Danh sách đầy đủ kể cả bác sĩ đã khóa, kèm tài khoản (trang admin) */
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('all')
  listAll(@Query() q: DoctorQuery) {
    return this.service.list(q, true);
  }

  /** Bác sĩ xem hồ sơ của mình */
  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  /** Bác sĩ tự sửa giới thiệu, kinh nghiệm, thế mạnh, quá trình đào tạo và công tác */
  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: DoctorProfileDto) {
    return this.service.updateMine(user, dto);
  }

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('DOCTOR')
  @Post('me/avatar')
  @HttpCode(200)
  @UseInterceptors(avatarUpload)
  async uploadMyAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Upload) {
    return this.service.setAvatar(await this.service.doctorIdOf(user), file);
  }

  @ApiBearerAuth()
  @Roles('DOCTOR')
  @Delete('me/avatar')
  async removeMyAvatar(@CurrentUser() user: AuthUser) {
    return this.service.removeAvatar(await this.service.doctorIdOf(user));
  }

  /** Hồ sơ bác sĩ cho bệnh nhân xem trước khi đặt lịch */
  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.profile(id);
  }

  /** Ảnh đại diện; URL kèm ?v=<avatarVersion> nên được cache lâu */
  @Public()
  @Get(':id/avatar')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'")
  avatar(@Param('id') id: string) {
    return this.service.avatar(id);
  }

  /** Hồ sơ kèm tài khoản để admin sửa (kể cả bác sĩ đã khóa) */
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get(':id/full')
  full(@Param('id') id: string) {
    return this.service.full(id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateDoctorDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('ADMIN')
  @Post(':id/avatar')
  @HttpCode(200)
  @UseInterceptors(avatarUpload)
  uploadAvatar(@Param('id') id: string, @UploadedFile() file: Upload) {
    return this.service.setAvatar(id, file);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':id/avatar')
  removeAvatar(@Param('id') id: string) {
    return this.service.removeAvatar(id);
  }
}
