package com.clinic.config;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Đọc biến môi trường (cùng tên như bản cũ, xem .env.example). */
@Component
public class AppEnv {
  private final Environment env;

  public AppEnv(Environment env) {
    this.env = env;
  }

  /** Giá trị đã bỏ khoảng trắng; trống thì null. */
  public String get(String key) {
    String v = env.getProperty(key);
    if (v == null) return null;
    v = v.trim();
    return v.isEmpty() ? null : v;
  }

  public String get(String key, String fallback) {
    String v = get(key);
    return v == null ? fallback : v;
  }

  public String require(String key) {
    String v = get(key);
    if (v == null) throw new IllegalStateException("Thiếu biến môi trường " + key);
    return v;
  }

  /** Số nguyên; trống hoặc sai định dạng thì dùng mặc định. */
  public int getInt(String key, int fallback) {
    String v = get(key);
    if (v == null) return fallback;
    try {
      return Integer.parseInt(v);
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  public boolean isFalse(String key) {
    return "false".equals(env.getProperty(key));
  }
}
