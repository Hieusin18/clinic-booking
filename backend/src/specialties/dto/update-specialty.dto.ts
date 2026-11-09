import { PartialType } from '@nestjs/swagger';
import { CreateSpecialtyDto } from './create-specialty.dto.js';

export class UpdateSpecialtyDto extends PartialType(CreateSpecialtyDto) {}
