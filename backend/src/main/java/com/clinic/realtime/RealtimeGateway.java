package com.clinic.realtime;

import com.clinic.config.AppEnv;
import com.clinic.entity.enums.Role;
import com.clinic.security.AuthUser;
import com.clinic.security.SessionVerifier;
import com.corundumstudio.socketio.AuthTokenResult;
import com.corundumstudio.socketio.Configuration;
import com.corundumstudio.socketio.SocketConfig;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Máy chủ Socket.IO (đường dẫn /api/socket.io), chạy nội bộ ở 127.0.0.1:SOCKET_PORT (mặc định 3002). Máy khách vẫn
 * kết nối cùng địa chỉ với API ("&lt;API&gt;/socket.io"): {@link SocketProxyFilter} chuyển tiếp sang cổng này.
 *
 * Kết nối phải kèm token đăng nhập ({@code auth: { token }}). Ai cũng vào phòng riêng của tài khoản mình (để cắt kết
 * nối khi phiên bị thu hồi); nhân viên (bác sĩ, lễ tân, admin) vào thêm phòng "staff".
 */
@Component
public class RealtimeGateway {
  public static final String SOCKET_PATH = "/api/socket.io";
  public static final String STAFF_ROOM = "staff";
  private static final Logger log = LoggerFactory.getLogger("Realtime");

  /** Không gửi token trong thời gian này sau khi mở kết nối thì bị ngắt. */
  static final long AUTH_TIMEOUT_SECONDS = 10;

  private final SessionVerifier sessions;
  private final com.fasterxml.jackson.databind.ObjectMapper mapper;
  private final int port;
  private SocketIOServer server;
  private ScheduledExecutorService timers;

  public RealtimeGateway(SessionVerifier sessions, AppEnv env, com.fasterxml.jackson.databind.ObjectMapper mapper) {
    this.sessions = sessions;
    this.mapper = mapper;
    this.port = env.getInt("SOCKET_PORT", 3002);
  }

  public static String userRoom(String userId) {
    return "user:" + userId;
  }

  public int getPort() {
    return port;
  }

  @PostConstruct
  public void start() {
    if ("true".equals(System.getProperty(com.clinic.ClinicBookingApplication.CLI_PROPERTY))) return;
    Configuration config = new Configuration();
    // Chỉ nghe trong máy: máy khách vào qua /api/socket.io của cổng API (SocketProxyFilter chuyển tiếp)
    config.setHostname("127.0.0.1");
    config.setPort(port);
    config.setContext(SOCKET_PATH);
    SocketConfig socket = new SocketConfig();
    socket.setReuseAddress(true);
    config.setSocketConfig(socket);
    // Giữ cả trường null trong dữ liệu gửi đi (mặc định netty-socketio bỏ đi), giống JSON của API và bản cũ
    config.setJsonSupport(new com.corundumstudio.socketio.protocol.JacksonJsonSupport() {
      @Override
      protected void init(com.fasterxml.jackson.databind.ObjectMapper om) {
        super.init(om);
        om.setDefaultPropertyInclusion(com.fasterxml.jackson.annotation.JsonInclude.Include.ALWAYS);
      }
    });
    server = new SocketIOServer(config);
    timers = Executors.newSingleThreadScheduledExecutor(r -> {
      Thread t = new Thread(r, "realtime-auth");
      t.setDaemon(true);
      return t;
    });
    // Socket.IO v4: token nằm trong gói CONNECT của namespace, gửi sau bước bắt tay. Luôn cho kết nối rồi mới báo
    // "auth:error" và ngắt (như bản cũ) để app nhận lý do "io server disconnect" và không tự nối lại.
    server.getNamespace("").addAuthTokenListener((data, client) -> {
      authenticate(client, data);
      return AuthTokenResult.AuthTokenResultSuccess;
    });
    server.addConnectListener(this::onConnect);
    server.start();
    log.info("Socket.IO đang chạy ở cổng {} (đường dẫn {})", port, SOCKET_PATH);
  }

  @PreDestroy
  public void stop() {
    if (timers != null) timers.shutdownNow();
    if (server == null) return;
    // Netty chờ kết nối đóng êm tới 15 giây mỗi nhóm luồng; khi tắt máy chủ chỉ chờ tối đa 3 giây
    Thread t = new Thread(server::stop, "realtime-stop");
    t.setDaemon(true);
    t.start();
    try {
      t.join(3000);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  /** Mở kết nối: phải gửi token trong {@link #AUTH_TIMEOUT_SECONDS} giây, không thì bị ngắt. */
  private void onConnect(SocketIOClient client) {
    timers.schedule(() -> {
      if (client.isChannelOpen() && client.get("userId") == null && client.get("rejected") == null) reject(client);
    }, AUTH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
  }

  private void authenticate(SocketIOClient client, Object auth) {
    Object token = auth instanceof Map<?, ?> m ? m.get("token") : null;
    try {
      if (!(token instanceof String t) || t.isEmpty()) throw new IllegalArgumentException("missing token");
      AuthUser user = sessions.verify(t).user();
      // Ghi lại phiên bản token để cắt kết nối khi tài khoản đăng xuất mọi máy / đổi mật khẩu / bị khóa
      client.set("userId", user.sub());
      client.set("ver", user.ver());
      client.joinRoom(userRoom(user.sub()));
      if (user.role() != Role.PATIENT) client.joinRoom(STAFF_ROOM);
    } catch (RuntimeException e) {
      client.set("rejected", Boolean.TRUE);
      // Chờ máy chủ gửi xong gói CONNECT rồi mới báo lỗi và ngắt
      timers.schedule(() -> reject(client), 100, TimeUnit.MILLISECONDS);
    }
  }

  private static void reject(SocketIOClient client) {
    client.sendEvent("auth:error", Map.of("message", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
    client.disconnect();
  }

  /** Ngắt các kết nối của một tài khoản, trừ những kết nối đã dùng token phiên bản {@code keepVer} (máy vừa đổi mật khẩu). */
  public void disconnectUser(String userId, Integer keepVer) {
    if (server == null) return;
    for (SocketIOClient c : new ArrayList<>(server.getRoomOperations(userRoom(userId)).getClients())) {
      Object ver = c.get("ver");
      if (keepVer == null || !keepVer.equals(ver)) c.disconnect();
    }
  }

  public void emit(String room, String event, Object payload) {
    try {
      // Đổi sang Map/List/chuỗi bằng ObjectMapper của API để ngày giờ có cùng định dạng với JSON trả về
      if (server != null) server.getRoomOperations(room).sendEvent(event, mapper.readValue(mapper.writeValueAsBytes(payload), Object.class));
    } catch (RuntimeException | java.io.IOException e) {
      log.warn("Không gửi được {}: {}", event, e.toString());
    }
  }
}
