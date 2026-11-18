package com.clinic.security;

import com.clinic.config.AppEnv;
import com.clinic.entity.enums.Role;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

/**
 * JWT ký HS256 bằng JWT_SECRET, hạn 7 ngày; nội dung {sub, role, ver, iat, exp}.
 * Cùng định dạng và khóa với bản NestJS cũ nên người dùng đang đăng nhập không bị đăng xuất khi chuyển bản.
 */
@Service
public class JwtService {
  public static final long EXPIRES_SECONDS = 7L * 24 * 3600;
  private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder B64D = Base64.getUrlDecoder();
  private static final String HEADER = B64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));

  private final byte[] secret;
  private final ObjectMapper mapper;

  public JwtService(AppEnv env, ObjectMapper mapper) {
    this.secret = env.require("JWT_SECRET").getBytes(StandardCharsets.UTF_8);
    this.mapper = mapper;
  }

  public String sign(AuthUser user) {
    long now = Instant.now().getEpochSecond();
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("sub", user.sub());
    payload.put("role", user.role().name());
    payload.put("ver", user.ver());
    payload.put("iat", now);
    payload.put("exp", now + EXPIRES_SECONDS);
    try {
      String body = HEADER + "." + B64.encodeToString(mapper.writeValueAsBytes(payload));
      return body + "." + B64.encodeToString(hmac(body));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  /** Kiểm tra chữ ký và hạn; sai thì ném {@link IllegalArgumentException}. */
  public AuthUser verify(String token) {
    String[] parts = token.split("\\.");
    if (parts.length != 3) throw new IllegalArgumentException("malformed");
    byte[] expected = hmac(parts[0] + "." + parts[1]);
    byte[] given;
    try {
      given = B64D.decode(parts[2]);
      JsonNode header = mapper.readTree(B64D.decode(parts[0]));
      if (!"HS256".equals(header.path("alg").asText())) throw new IllegalArgumentException("alg");
    } catch (IllegalArgumentException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalArgumentException("malformed", e);
    }
    if (!MessageDigest.isEqual(expected, given)) throw new IllegalArgumentException("signature");
    try {
      JsonNode p = mapper.readTree(B64D.decode(parts[1]));
      if (!p.has("exp") || p.get("exp").asLong() < Instant.now().getEpochSecond()) throw new IllegalArgumentException("expired");
      return new AuthUser(p.path("sub").asText(), Role.valueOf(p.path("role").asText()), p.path("ver").asInt(0));
    } catch (IllegalArgumentException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalArgumentException("malformed", e);
    }
  }

  private byte[] hmac(String data) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException | InvalidKeyException e) {
      throw new IllegalStateException(e);
    }
  }
}
