package com.clinic.util;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Hàm phụ cho xác minh số điện thoại bằng tin nhắn. */
public final class PhoneVerify {
  /** Tiền tố trong tin nhắn (lạ để tin thường của chủ máy cổng không làm Phím tắt chạy nhầm) */
  public static final String SMS_PREFIX = "PKXM";
  private static final Pattern CODE = Pattern.compile("(?:^|\\D)(\\d{6})(?:\\D|$)");
  private static final Pattern PREFIX = Pattern.compile(SMS_PREFIX, Pattern.CASE_INSENSITIVE);

  private PhoneVerify() {}

  public static String sha256(String s) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public static String hmacHex(String key, String data) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException | InvalidKeyException e) {
      throw new IllegalStateException(e);
    }
  }

  /** "+84 912 345 678", "84912345678", "0912-345-678" → "0912345678"; không phải số di động VN → null */
  public static String normalizePhone(String raw) {
    String digits = raw.replaceAll("[^\\d+]", "");
    String local = digits.replaceFirst("^\\+?84", "0");
    return local.matches("^0\\d{9}$") ? local : null;
  }

  /** Lấy mã 6 số trong tin nhắn ("PKXM 482913", "pkxm482913", hoặc chỉ "482913") */
  public static String codeIn(String body) {
    Matcher m = CODE.matcher(PREFIX.matcher(body).replaceFirst(" "));
    return m.find() ? m.group(1) : null;
  }

  /** So sánh chuỗi trong thời gian không đổi. */
  public static boolean safeEqual(String a, String b) {
    return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
  }
}
