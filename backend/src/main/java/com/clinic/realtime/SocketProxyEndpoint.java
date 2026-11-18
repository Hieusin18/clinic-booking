package com.clinic.realtime;

import jakarta.websocket.CloseReason;
import jakarta.websocket.Endpoint;
import jakarta.websocket.EndpointConfig;
import jakarta.websocket.MessageHandler;
import jakarta.websocket.Session;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;

/** Một kết nối WebSocket của máy khách, nối thẳng sang máy chủ Socket.IO nội bộ. */
public class SocketProxyEndpoint extends Endpoint {
  private final HttpClient http;
  private final String target;
  private WebSocket upstream;
  /** Gửi lần lượt từng gói lên máy chủ Socket.IO (WebSocket của Java không cho gửi chồng). */
  private CompletableFuture<?> sending = CompletableFuture.completedFuture(null);

  public SocketProxyEndpoint(HttpClient http, String target) {
    this.http = http;
    this.target = target;
  }

  @Override
  public void onOpen(Session session, EndpointConfig config) {
    session.setMaxIdleTimeout(0);
    try {
      upstream = http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5)).buildAsync(URI.create(target), new Upstream(session))
          .get(10, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      closeQuietly(session, CloseReason.CloseCodes.TRY_AGAIN_LATER);
      return;
    } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException e) {
      closeQuietly(session, CloseReason.CloseCodes.TRY_AGAIN_LATER);
      return;
    }
    session.addMessageHandler(String.class, (MessageHandler.Whole<String>) text -> send(ws -> ws.sendText(text, true)));
    session.addMessageHandler(ByteBuffer.class, (MessageHandler.Whole<ByteBuffer>) data -> send(ws -> ws.sendBinary(data, true)));
  }

  private synchronized void send(java.util.function.Function<WebSocket, CompletableFuture<WebSocket>> op) {
    WebSocket ws = upstream;
    if (ws == null) return;
    sending = sending.thenCompose(x -> op.apply(ws)).exceptionally(e -> {
      ws.abort();
      return null;
    });
  }

  @Override
  public void onClose(Session session, CloseReason reason) {
    WebSocket ws = upstream;
    if (ws != null && !ws.isOutputClosed()) {
      synchronized (this) {
        sending = sending.thenCompose(x -> ws.sendClose(WebSocket.NORMAL_CLOSURE, "")).exceptionally(e -> {
          ws.abort();
          return null;
        });
      }
    }
  }

  @Override
  public void onError(Session session, Throwable error) {
    WebSocket ws = upstream;
    if (ws != null) ws.abort();
  }

  private static void closeQuietly(Session session, CloseReason.CloseCode code) {
    try {
      if (session.isOpen()) session.close(new CloseReason(code, ""));
    } catch (IOException ignored) {
      // đã đóng
    }
  }

  /** Nhận gói từ máy chủ Socket.IO, chuyển nguyên vẹn cho máy khách. */
  private static final class Upstream implements WebSocket.Listener {
    private final Session session;
    private final StringBuilder text = new StringBuilder();
    private final ByteArrayOutputStream binary = new ByteArrayOutputStream();

    Upstream(Session session) {
      this.session = session;
    }

    @Override
    public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
      text.append(data);
      if (last) {
        String message = text.toString();
        text.setLength(0);
        try {
          if (session.isOpen()) session.getBasicRemote().sendText(message);
        } catch (IOException e) {
          ws.abort();
        }
      }
      ws.request(1);
      return null;
    }

    @Override
    public CompletionStage<?> onBinary(WebSocket ws, ByteBuffer data, boolean last) {
      byte[] chunk = new byte[data.remaining()];
      data.get(chunk);
      binary.writeBytes(chunk);
      if (last) {
        byte[] message = binary.toByteArray();
        binary.reset();
        try {
          if (session.isOpen()) session.getBasicRemote().sendBinary(ByteBuffer.wrap(message));
        } catch (IOException e) {
          ws.abort();
        }
      }
      ws.request(1);
      return null;
    }

    @Override
    public CompletionStage<?> onClose(WebSocket ws, int statusCode, String reason) {
      closeQuietly(session, CloseReason.CloseCodes.NORMAL_CLOSURE);
      return null;
    }

    @Override
    public void onError(WebSocket ws, Throwable error) {
      closeQuietly(session, CloseReason.CloseCodes.UNEXPECTED_CONDITION);
    }
  }
}
