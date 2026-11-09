/** Phiên chờ tin nhắn trong bấy nhiêu phút */
export const VERIFY_TTL_MINUTES = 10;

/** Đã xác minh thì phải dùng (đăng ký / đặt mật khẩu) trong bấy nhiêu phút */
export const USE_WITHIN_MINUTES = 30;

/** Tạo phiên: tối đa theo số điện thoại / theo IP trong một giờ (không tốn tiền nhưng tránh rác CSDL) */
export const MAX_PER_PHONE_HOUR = 10;
export const MAX_PER_IP_HOUR = 30;

/** Tiền tố trong tin nhắn (lạ để tin thường của chủ máy cổng không làm Phím tắt chạy nhầm) */
export const SMS_PREFIX = 'PKXM';
