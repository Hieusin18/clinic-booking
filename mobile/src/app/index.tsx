import { Redirect } from 'expo-router';

/** Điểm vào: mở thẳng các tab. Xem bác sĩ không cần đăng nhập; tính năng cần tài khoản tự mời đăng nhập. */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
