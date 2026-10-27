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
