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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Máy chủ Socket.IO (đường dẫn /api/socket.io), chạy ở cổng riêng SOCKET_PORT (mặc định 3002); Caddy chuyển
 * /api/socket.io/* tới cổng này nên web và app vẫn kết nối cùng địa chỉ với API.
 *
 * Kết nối phải kèm token đăng nhập ({@code auth: { token }}). Ai cũng vào phòng riêng của tài khoản mình (để cắt kết
 * nối khi phiên bị thu hồi); nhân viên (bác sĩ, lễ tân, admin) vào thêm phòng "staff".
 */
@Component
public class RealtimeGateway {
  public static final String SOCKET_PATH = "/api/socket.io";
  public static final String STAFF_ROOM = "staff";
  private static final Logger log = LoggerFactory.getLogger("Realtime");

  private final SessionVerifier sessions;
  private final int port;
  private SocketIOServer server;

  public RealtimeGateway(SessionVerifier sessions, AppEnv env) {
    this.sessions = sessions;
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
    config.setHostname("0.0.0.0");
    config.setPort(port);
    config.setContext(SOCKET_PATH);
    SocketConfig socket = new SocketConfig();
    socket.setReuseAddress(true);
    config.setSocketConfig(socket);
    server = new SocketIOServer(config);
    // Token kiểm tra ở bước connect bên dưới (để gửi được "auth:error" trước khi ngắt như bản cũ)
    server.getNamespace("").addAuthTokenListener((data, client) -> AuthTokenResult.AuthTokenResultSuccess);
    server.addConnectListener(this::onConnect);
    server.start();
    log.info("Socket.IO đang chạy ở cổng {} (đường dẫn {})", port, SOCKET_PATH);
  }

  @PreDestroy
  public void stop() {
    if (server != null) server.stop();
  }

  private void onConnect(SocketIOClient client) {
    Object auth = client.getHandshakeData().getAuthToken();
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
      client.sendEvent("auth:error", Map.of("message", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
      client.disconnect();
    }
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
      if (server != null) server.getRoomOperations(room).sendEvent(event, payload);
    } catch (RuntimeException e) {
      log.warn("Không gửi được {}: {}", event, e.toString());
    }
  }
}
