import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** API không cần đăng nhập (mặc định mọi API đều cần). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
