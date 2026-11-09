import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create-patient.dto.js';

/** Bệnh nhân tự sửa hồ sơ: không đổi SĐT vì SĐT là tên đăng nhập. */
export class UpdateMyProfileDto extends PartialType(OmitType(CreatePatientDto, ['phone'] as const)) {}
