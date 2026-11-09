import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Lưu token đăng nhập an toàn: Keychain (iOS) / Keystore (Android) qua expo-secure-store.
 * Bản web (chỉ dùng để xem thử) không có SecureStore nên dùng localStorage.
 */
const KEY = 'clinic.token';

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string | null) {
    if (Platform.OS === 'web') {
      try {
        if (token) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
      } catch {
        /* bỏ qua */
      }
      return;
    }
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  },
};

const USER_KEY = 'clinic.user';

/**
 * Thông tin tài khoản lần gần nhất lấy được: mở app lúc mất mạng (hoặc máy chủ đang khởi động lại) vẫn vào được,
 * không bị đăng xuất. Lưu cùng chỗ với token.
 */
export const userCache = {
  async get<T>(): Promise<T | null> {
    try {
      const raw = Platform.OS === 'web' ? localStorage.getItem(USER_KEY) : await SecureStore.getItemAsync(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set(user: unknown) {
    try {
      if (Platform.OS === 'web') {
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
      } else if (user) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      else await SecureStore.deleteItemAsync(USER_KEY);
    } catch {
      /* bỏ qua: chỉ là bộ nhớ đệm */
    }
  },
};
