import { router, type Href } from 'expo-router';


/**
 * Màn hình cần đăng nhập ghi lại địa chỉ của mình trước khi mở trang đăng nhập/đăng ký; đăng nhập xong thì quay về
 * đúng chỗ đó (vd. đang đặt lịch với một bác sĩ) thay vì về trang đầu.
 */
let pending: string | null = null;

export function setReturnTo(path: string | null) {
  pending = path;
}

/** Đăng nhập / đăng ký / đặt lại mật khẩu xong: về màn hình đang dở, không có thì về trang đầu. */
export function finishSignIn() {
  const to = pending;
  pending = null;
  if (to) router.dismissTo(to as Href);
  else router.replace('/(tabs)');
}
