package com.clinic.service;

import com.clinic.config.AppEnv;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Gọi API Expo Push (miễn phí, không cần tài khoản; có EXPO_ACCESS_TOKEN thì gửi kèm). */
@Component
public class ExpoPushClient {
  private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
  private final ObjectMapper mapper;
  private final String accessToken;
  private String endpoint;

  public ExpoPushClient(AppEnv env, ObjectMapper mapper) {
    this.mapper = mapper;
    this.endpoint = env.get("EXPO_PUSH_URL", EXPO_PUSH_URL);
    this.accessToken = env.get("EXPO_ACCESS_TOKEN");
  }

  public String getEndpoint() {
    return endpoint;
  }

  /** Đổi địa chỉ gửi (test dùng máy chủ Expo giả). */
  public void setEndpoint(String endpoint) {
    this.endpoint = endpoint;
  }

  /** Trả về kết quả theo đúng thứ tự tin gửi đi (Expo nhận tối đa 100 tin mỗi lần). */
  public List<JsonNode> send(List<Map<String, Object>> messages) throws IOException, InterruptedException {
    List<JsonNode> tickets = new ArrayList<>();
    for (int i = 0; i < messages.size(); i += 100) {
      HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(endpoint))
          .timeout(Duration.ofSeconds(10))
          .header("Accept", "application/json")
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(messages.subList(i, Math.min(i + 100, messages.size())))));
      if (accessToken != null) b.header("Authorization", "Bearer " + accessToken);
      HttpResponse<byte[]> res = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
      if (res.statusCode() < 200 || res.statusCode() >= 300) throw new IOException("Expo Push trả về " + res.statusCode());
      JsonNode data = mapper.readTree(res.body()).path("data");
      if (data.isArray()) data.forEach(tickets::add);
    }
    return tickets;
  }
}
