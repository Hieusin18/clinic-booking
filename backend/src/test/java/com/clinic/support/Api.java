package com.clinic.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Gọi API qua HTTP thật (giống supertest của bộ test cũ): api.post("/api/...").auth(token).send(body).expect(201). */
public class Api {
  private static final HttpClient HTTP = HttpClient.newHttpClient();
  private static final ObjectMapper JSON = new ObjectMapper();

  private final String base;

  public Api(int port) {
    this.base = "http://127.0.0.1:" + port;
  }

  public Req get(String path) {
    return new Req("GET", path);
  }

  public Req post(String path) {
    return new Req("POST", path);
  }

  public Req put(String path) {
    return new Req("PUT", path);
  }

  public Req patch(String path) {
    return new Req("PATCH", path);
  }

  public Req delete(String path) {
    return new Req("DELETE", path);
  }

  /** Mã hóa ký tự ngoài ASCII và khoảng trắng trong đường dẫn (tham số tìm kiếm tiếng Việt). */
  static String encode(String path) {
    StringBuilder sb = new StringBuilder();
    for (byte b : path.getBytes(StandardCharsets.UTF_8)) {
      int c = b & 0xff;
      if (c > 32 && c < 127 && "\"<>\\^`{|}".indexOf(c) < 0) {
        sb.append((char) c);
      } else {
        sb.append('%').append(String.format("%02X", c));
      }
    }
    return sb.toString();
  }

  /** Một request đang dựng. */
  public class Req {
    private final String method;
    private final String path;
    private final Map<String, String> headers = new LinkedHashMap<>();
    private HttpRequest.BodyPublisher body = HttpRequest.BodyPublishers.noBody();

    Req(String method, String path) {
      this.method = method;
      this.path = path;
    }

    public Req auth(String token) {
      headers.put("Authorization", "Bearer " + token);
      return this;
    }

    public Req header(String name, String value) {
      headers.put(name, value);
      return this;
    }

    /** Thân JSON: Map, List, JsonNode hoặc chuỗi JSON. */
    public Req send(Object json) {
      try {
        String s = json instanceof String str ? str : JSON.writeValueAsString(json);
        headers.putIfAbsent("Content-Type", "application/json");
        body = HttpRequest.BodyPublishers.ofString(s, StandardCharsets.UTF_8);
        return this;
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    }

    public Req raw(String contentType, byte[] data) {
      headers.put("Content-Type", contentType);
      body = HttpRequest.BodyPublishers.ofByteArray(data);
      return this;
    }

    /** multipart/form-data với một hoặc nhiều tệp cùng tên trường. */
    public Req files(String field, List<FilePart> files) {
      String boundary = "----test" + UUID.randomUUID();
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      try {
        for (FilePart f : files) {
          out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + field + "\"; filename=\"" + f.name()
              + "\"\r\nContent-Type: " + f.contentType() + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
          out.write(f.data());
          out.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
      headers.put("Content-Type", "multipart/form-data; boundary=" + boundary);
      body = HttpRequest.BodyPublishers.ofByteArray(out.toByteArray());
      return this;
    }

    public Res call() {
      HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + encode(path))).method(method, body);
      headers.forEach(b::header);
      try {
        HttpResponse<byte[]> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        return new Res(r.statusCode(), r.body(), r.headers().map());
      } catch (IOException e) {
        throw new IllegalStateException(e);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
    }

    public Res expect(int status) {
      Res r = call();
      assertThat(r.status()).as("%s %s → %s", method, path, r.text()).isEqualTo(status);
      return r;
    }
  }

  public record FilePart(String name, String contentType, byte[] data) {}

  /** Kết quả: mã trạng thái, thân (JSON / chữ / byte) và header. */
  public record Res(int status, byte[] bytes, Map<String, List<String>> headers) {
    public String text() {
      return new String(bytes, StandardCharsets.UTF_8);
    }

    public JsonNode body() {
      try {
        return bytes.length == 0 ? JSON.nullNode() : JSON.readTree(bytes);
      } catch (IOException e) {
        throw new IllegalStateException("Không phải JSON: " + text(), e);
      }
    }

    public String header(String name) {
      for (var e : headers.entrySet()) {
        if (e.getKey().equalsIgnoreCase(name)) return e.getValue().get(0);
      }
      return null;
    }
  }
}
