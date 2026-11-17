package com.clinic.security;

import java.security.SecureRandom;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Mã hóa và kiểm tra độ mạnh mật khẩu (bcrypt 10 vòng, đọc được hash cũ của bcryptjs). */
public final class Passwords {
  private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder(10);
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final Pattern LETTER = Pattern.compile("\\p{L}");
  private static final Pattern DIGIT = Pattern.compile("\\d");

  /** Độ dài tối thiểu của mật khẩu người dùng tự đặt (mật khẩu tạm do admin cấp vẫn phải đổi ở lần đăng nhập đầu) */
  public static final int MIN_PASSWORD = 8;

  /** Mật khẩu quá phổ biến, kẻ dò mật khẩu luôn thử trước */
  private static final Set<String> COMMON = Set.of(
      "12345678", "123456789", "1234567890", "11111111", "88888888", "00000000", "password", "password1",
      "matkhau1", "matkhau123", "abc12345", "abcd1234", "qwerty123", "iloveyou1", "admin123", "admin1234");

  private Passwords() {}

  public static String hash(String plain) {
    return BCRYPT.encode(limit(plain));
  }

  /** bcrypt chỉ dùng 72 byte đầu (bcryptjs của bản cũ tự cắt; Spring báo lỗi nên cắt trước). */
  private static String limit(String plain) {
    if (plain.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72) return plain;
    StringBuilder sb = new StringBuilder();
    int bytes = 0;
    for (int i = 0; i < plain.length(); ) {
      int cp = plain.codePointAt(i);
      String ch = new String(Character.toChars(cp));
      int n = ch.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
      if (bytes + n > 72) break;
      sb.append(ch);
      bytes += n;
      i += Character.charCount(cp);
    }
    return sb.toString();
  }

  public static boolean verify(String plain, String hash) {
    if (plain == null || hash == null) return false;
    try {
      return BCRYPT.matches(limit(plain), hash);
    } catch (IllegalArgumentException e) {
      return false;
    }
  }

  /**
   * Mật khẩu mới có đủ mạnh không: trả về lý do (tiếng Việt) nếu chưa đạt, null nếu được.
   * Quy tắc: tối thiểu 8 ký tự, có cả chữ và số, không phải mật khẩu phổ biến, không trùng số điện thoại.
   */
  public static String problem(String password, String phone) {
    int length = password.length();
    if (length < MIN_PASSWORD) return "Mật khẩu tối thiểu " + MIN_PASSWORD + " ký tự";
    if (length > 72) return "Mật khẩu tối đa 72 ký tự";
    if (!LETTER.matcher(password).find() || !DIGIT.matcher(password).find()) return "Mật khẩu cần có cả chữ và số";
    if (COMMON.contains(password.toLowerCase())) return "Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác";
    if (phone != null && password.contains(phone)) return "Mật khẩu không được chứa số điện thoại";
    return null;
  }

  /** Mật khẩu tạm 10 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ và số: vd. "Kx7m-4Pq9a" */
  public static String temporary() {
    String all = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz" + "23456789";
    while (true) {
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i < 9; i++) {
        if (i == 4) sb.append('-');
        sb.append(all.charAt(RANDOM.nextInt(all.length())));
      }
      String pw = sb.toString();
      if (problem(pw, null) == null) return pw;
    }
  }
}
