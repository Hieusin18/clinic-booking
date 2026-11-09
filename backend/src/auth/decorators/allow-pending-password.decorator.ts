import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';

/** API vẫn gọi được khi tài khoản đang dùng mật khẩu tạm (xem thông tin, đổi mật khẩu, đăng xuất). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);
