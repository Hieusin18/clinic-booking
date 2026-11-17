package com.clinic.service;

import com.clinic.entity.User;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.PushTokenRepository;
import com.clinic.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Thu hồi phiên đăng nhập ở các máy khác. Token cũ đã hết hiệu lực nhờ tokenVersion, nhưng máy cũ vẫn còn hai thứ
 * không đi qua bước kiểm tra token: thông báo đẩy (Expo gửi thẳng vào máy) và kết nối realtime đang mở.
 * Gọi revoke() sau mỗi lần đăng xuất mọi máy, đổi / đặt lại mật khẩu, khóa hoặc gỡ tài khoản.
 */
@Service
public class SessionsService {
  private final UserRepository users;
  private final PushTokenRepository pushTokens;
  private final RealtimeService realtime;

  public SessionsService(UserRepository users, PushTokenRepository pushTokens, RealtimeService realtime) {
    this.users = users;
    this.pushTokens = pushTokens;
    this.realtime = realtime;
  }

  public void revoke(String userId) {
    revoke(userId, null);
  }

  /**
   * Ngắt mọi kết nối realtime dùng token cũ (máy đang dùng tự kết nối lại bằng token mới nếu vừa nhận).
   *
   * @param keepPushToken token đẩy của máy đang dùng (khi đổi mật khẩu thì máy này vẫn đăng nhập)
   */
  @Transactional
  public void revoke(String userId, String keepPushToken) {
    User user = users.findById(userId).orElse(null);
    if (keepPushToken != null && !keepPushToken.isEmpty()) {
      pushTokens.deleteAllOfUserExcept(userId, keepPushToken);
    } else {
      pushTokens.deleteAllOfUser(userId);
    }
    realtime.disconnectUser(userId, user != null && user.isActive() ? user.getTokenVersion() : null);
  }
}
