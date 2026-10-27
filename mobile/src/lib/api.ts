import axios from 'axios';
import Constants from 'expo-constants';

/**
 * Địa chỉ API, ưu tiên theo thứ tự:
 * 1. Biến môi trường EXPO_PUBLIC_API_URL (vd. khi build APK trỏ về server HTTPS)
 * 2. expo.extra.apiUrl trong app.json (IP LAN của máy chạy backend khi dev)
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000/api';

export const api = axios.create({ baseURL: API_URL, timeout: 15_000 });

let currentToken: string | null = null;
export const setApiToken = (token: string | null) => (currentToken = token);

api.interceptors.request.use((config) => {
  if (currentToken) config.headers.Authorization = `Bearer ${currentToken}`;
  return config;
});

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => (onUnauthorized = fn);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.includes('/auth/')) onUnauthorized?.();
    return Promise.reject(err);
  },
);
