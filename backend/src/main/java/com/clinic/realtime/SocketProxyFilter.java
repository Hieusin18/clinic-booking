package com.clinic.realtime;

import jakarta.servlet.AsyncContext;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.websocket.DeploymentException;
import jakarta.websocket.server.ServerContainer;
import jakarta.websocket.server.ServerEndpointConfig;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Collections;
import java.util.Map;
import java.util.Set;

/**
 * Cho Socket.IO đi chung cổng với API: mọi request tới /api/socket.io/* (long-polling và WebSocket) được chuyển tiếp
 * sang máy chủ Socket.IO chạy nội bộ ở 127.0.0.1:SOCKET_PORT. Nhờ vậy web, app, Caddy và proxy của Vite giữ nguyên
 * địa chỉ "&lt;API&gt;/socket.io" như bản NestJS cũ.
 */
public class SocketProxyFilter implements Filter {
  private static final Set<String> REQUEST_HEADERS = Set.of("content-type", "origin", "cookie", "user-agent", "accept");
  private static final Set<String> RESPONSE_HEADERS = Set.of("content-type", "set-cookie", "cache-control", "access-control-allow-origin",
      "access-control-allow-credentials", "access-control-allow-headers", "access-control-allow-methods");

  private final String httpTarget;
  private final String wsTarget;
  private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();

  public SocketProxyFilter(int socketPort) {
    this.httpTarget = "http://127.0.0.1:" + socketPort;
    this.wsTarget = "ws://127.0.0.1:" + socketPort;
  }

  @Override
  public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
    HttpServletRequest req = (HttpServletRequest) request;
    HttpServletResponse res = (HttpServletResponse) response;
    String path = req.getRequestURI() + (req.getQueryString() == null ? "" : "?" + req.getQueryString());
    if ("websocket".equalsIgnoreCase(req.getHeader("Upgrade"))) {
      upgrade(req, res, path);
    } else {
      forward(req, path);
    }
  }

  /** Chuyển WebSocket: mở kết nối tới máy chủ Socket.IO rồi chuyển qua lại từng gói tin. */
  private void upgrade(HttpServletRequest req, HttpServletResponse res, String path) throws IOException {
    ServerContainer container = (ServerContainer) req.getServletContext().getAttribute(ServerContainer.class.getName());
    if (container == null) {
      res.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
      return;
    }
    String target = wsTarget + path;
    ServerEndpointConfig config = ServerEndpointConfig.Builder.create(SocketProxyEndpoint.class, "/socket.io/")
        .configurator(new ServerEndpointConfig.Configurator() {
          @Override
          public <T> T getEndpointInstance(Class<T> type) {
            return type.cast(new SocketProxyEndpoint(http, target));
          }

          @Override
          public boolean checkOrigin(String origin) {
            return true;
          }
        })
        .build();
    try {
      container.upgradeHttpToWebSocket(req, res, config, Map.of());
    } catch (DeploymentException e) {
      throw new IOException(e);
    }
  }

  /** Chuyển long-polling (GET chờ tin, POST gửi tin) bất đồng bộ để không giữ luồng của Tomcat trong lúc chờ. */
  private void forward(HttpServletRequest req, String path) throws IOException {
    byte[] body = req.getInputStream().readAllBytes();
    HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(httpTarget + path)).timeout(Duration.ofSeconds(90))
        .method(req.getMethod(), body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
    for (String name : Collections.list(req.getHeaderNames())) {
      if (REQUEST_HEADERS.contains(name.toLowerCase())) {
        for (String v : Collections.list(req.getHeaders(name))) b.header(name, v);
      }
    }
    AsyncContext ctx = req.startAsync();
    ctx.setTimeout(100_000);
    http.sendAsync(b.build(), HttpResponse.BodyHandlers.ofByteArray()).whenComplete((upstream, err) -> {
      try {
        HttpServletResponse out = (HttpServletResponse) ctx.getResponse();
        if (err != null) {
          out.setStatus(HttpServletResponse.SC_BAD_GATEWAY);
        } else {
          out.setStatus(upstream.statusCode());
          upstream.headers().map().forEach((k, values) -> {
            if (RESPONSE_HEADERS.contains(k.toLowerCase())) values.forEach(v -> out.addHeader(k, v));
          });
          out.getOutputStream().write(upstream.body());
        }
      } catch (IOException | RuntimeException ignored) {
        // Máy khách đã đóng kết nối
      } finally {
        try {
          ctx.complete();
        } catch (IllegalStateException ignored) {
          // AsyncContext đã đóng (hết giờ hoặc máy khách ngắt)
        }
      }
    });
  }
}
