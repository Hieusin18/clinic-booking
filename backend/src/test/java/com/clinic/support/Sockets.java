package com.clinic.support;

import static org.assertj.core.api.Assertions.assertThat;

import io.socket.client.IO;
import io.socket.client.Socket;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Kết nối Socket.IO như web và app (path /api/socket.io, token trong auth). */
public final class Sockets {
  private Sockets() {}

  /** Cổng của API (IntegrationTest đặt trước mỗi test): Socket.IO đi chung cổng qua /api/socket.io. */
  public static volatile int port;

  public static String url() {
    return "http://127.0.0.1:" + port;
  }

  /** Tạo socket chưa kết nối, mặc định chỉ dùng WebSocket như test của bản cũ. */
  public static Socket create(String token, String... transports) {
    IO.Options opts = IO.Options.builder().setPath("/api/socket.io").setAuth(Map.of("token", token))
        .setTransports(transports.length == 0 ? new String[] {"websocket"} : transports).setReconnection(false).build();
    return IO.socket(URI.create(url()), opts);
  }

  /** Kết nối đã mở cùng lý do bị ngắt (hoàn thành khi socket bị ngắt). */
  public record Open(Socket socket, CompletableFuture<String> closed) {
    public String closedReason() {
      try {
        return closed.get(5, TimeUnit.SECONDS);
      } catch (Exception e) {
        throw new AssertionError("socket không bị ngắt trong 5 giây", e);
      }
    }

    public void close() {
      socket.disconnect();
      socket.close();
    }
  }

  /** Mở kết nối, chờ tới khi kết nối xong. */
  public static Open open(String token, String... transports) {
    Socket s = create(token, transports);
    CompletableFuture<Void> connected = new CompletableFuture<>();
    CompletableFuture<String> closed = new CompletableFuture<>();
    s.once(Socket.EVENT_CONNECT, a -> connected.complete(null));
    s.once(Socket.EVENT_CONNECT_ERROR, a -> connected.completeExceptionally(new AssertionError("connect_error: " + (a.length > 0 ? a[0] : ""))));
    s.once(Socket.EVENT_DISCONNECT, a -> closed.complete(a.length > 0 ? String.valueOf(a[0]) : ""));
    s.connect();
    try {
      connected.get(5, TimeUnit.SECONDS);
    } catch (Exception e) {
      s.close();
      throw new AssertionError("không kết nối được Socket.IO", e);
    }
    assertThat(s.connected()).isTrue();
    return new Open(s, closed);
  }
}
