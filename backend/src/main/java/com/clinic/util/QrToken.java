package com.clinic.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Token cho mã QR động ở quầy. Dạng: base64url(payload) + "." + base64url(HMAC-SHA256(payload)),
 * payload = {"c": clinicId, "t": thời điểm tạo (giây)}. Không lưu CSDL: backend chỉ kiểm tra chữ ký và tuổi của token.
 */
public final class QrToken {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

  private QrToken() {}

  /** Kết quả kiểm tra: ok, hoặc lý do malformed / bad-signature / expired / wrong-clinic. */
  public record Check(boolean ok, String reason) {}

  private static String sign(String data, String secret) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return B64.encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException | InvalidKeyException e) {
      throw new IllegalStateException(e);
    }
  }

  public static String create(String clinicId, String secret, long nowMillis) {
    String payload = "{\"c\":" + quote(clinicId) + ",\"t\":" + nowMillis / 1000 + "}";
    String data = B64.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    return data + "." + sign(data, secret);
  }

  private static String quote(String s) {
    try {
      return JSON.writeValueAsString(s);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  public static Check verify(String token, String secret, String clinicId, long ttlSeconds, long nowMillis) {
    String[] parts = token.split("\\.", -1);
    if (parts.length < 2 || parts[0].isEmpty() || parts[1].isEmpty()) return new Check(false, "malformed");
    String data = parts[0];
    String sig = parts[1];
    byte[] expected = sign(data, secret).getBytes(StandardCharsets.UTF_8);
    if (!MessageDigest.isEqual(expected, sig.getBytes(StandardCharsets.UTF_8))) return new Check(false, "bad-signature");
    JsonNode payload;
    try {
      payload = JSON.readTree(Base64.getUrlDecoder().decode(data));
    } catch (Exception e) {
      return new Check(false, "malformed");
    }
    long nowSec = nowMillis / 1000;
    long t = payload.path("t").asLong();
    if (nowSec - t > ttlSeconds || t > nowSec + 5) return new Check(false, "expired");
    if (!clinicId.equals(payload.path("c").asText(null))) return new Check(false, "wrong-clinic");
    return new Check(true, null);
  }
}
