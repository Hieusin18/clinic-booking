/** Token Expo Push của máy này sau khi đã đăng ký với server (để gỡ khi đăng xuất). */
let current: string | null = null;

export const rememberPushToken = (token: string | null) => (current = token);

/** Lấy rồi quên token: đăng xuất gọi một lần để báo server thôi gửi về máy này. */
export function takePushToken() {
  const t = current;
  current = null;
  return t;
}
