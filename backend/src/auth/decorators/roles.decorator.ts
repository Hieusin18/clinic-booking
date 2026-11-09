import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums.js';

export const ROLES = 'roles';

/** Chỉ các vai trò được liệt kê mới gọi được API. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
