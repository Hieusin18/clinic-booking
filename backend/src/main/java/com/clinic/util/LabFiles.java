package com.clinic.util;

import com.clinic.repository.LabFileInfo;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Tệp kết quả cận lâm sàng: nhận diện loại tệp, tên tệp và đường dẫn có chữ ký. */
public final class LabFiles {
  public static final int LAB_FILE_MAX_BYTES = 10 * 1024 * 1024;
  public static final int LAB_FILES_PER_ORDER = 10;
  private static final long LINK_TTL_MS = 60 * 60_000L;

  private LabFiles() {}

  /** Nhận diện tệp theo nội dung, không tin phần mở rộng hay Content-Type trình duyệt gửi lên. */
  public static String detect(byte[] b) {
    if (b.length >= 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) return "image/jpeg";
    byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (b.length >= 8 && Arrays.equals(Arrays.copyOf(b, 8), png)) return "image/png";
    if (b.length >= 5 && new String(b, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) return "application/pdf";
    return null;
  }

  /** Tên tệp: bỏ đường dẫn và ký tự điều khiển, tối đa 120 ký tự; trống thì đặt tên mặc định theo loại tệp. */
  public static String cleanFileName(String raw, String mimeType) {
    String s = raw == null ? "" : raw;
    String[] parts = s.split("[\\\\/]", -1);
    String base = parts[parts.length - 1].replaceAll("[\\u0000-\\u001f\"]", "").trim();
    if (base.length() > 120) base = base.substring(0, 120);
    if (!base.isEmpty()) return base;
    return "ket-qua." + ("application/pdf".equals(mimeType) ? "pdf" : "image/png".equals(mimeType) ? "png" : "jpg");
  }

  private static String sign(String secret, String id, long exp) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(("lab-file:" + id + ":" + exp).getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException | InvalidKeyException e) {
      throw new IllegalStateException(e);
    }
  }

  /** Đường dẫn (tương đối với /api) mở một tệp kết quả, hết hạn sau 1 giờ. */
  public static String signedPath(String secret, String id, long nowMillis) {
    long exp = nowMillis + LINK_TTL_MS;
    return "/lab-files/" + id + "?exp=" + exp + "&sig=" + sign(secret, id, exp);
  }

  public static boolean verifyLink(String secret, String id, String exp, String sig, long nowMillis) {
    if (exp == null || sig == null) return false;
    long expMs;
    try {
      expMs = Long.parseLong(exp);
    } catch (NumberFormatException e) {
      return false;
    }
    if (expMs < nowMillis) return false;
    return MessageDigest.isEqual(sign(secret, id, expMs).getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8));
  }

  /** Thông tin tệp kèm đường dẫn có chữ ký. */
  public static Map<String, Object> view(LabFileInfo f, String secret, long nowMillis) {
    return com.clinic.view.Json.obj("id", f.id(), "fileName", f.fileName(), "mimeType", f.mimeType(), "size", f.size(), "createdAt", f.createdAt(),
        "url", signedPath(secret, f.id(), nowMillis));
  }
}
