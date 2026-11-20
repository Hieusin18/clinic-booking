package com.clinic.service;

import com.clinic.entity.Doctor;
import com.clinic.entity.Notification;
import com.clinic.entity.PushToken;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.NotificationType;
import com.clinic.entity.enums.ResultMode;
import com.clinic.exception.ApiException;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.LabOrderRepository;
import com.clinic.repository.NotificationRepository;
import com.clinic.repository.PushTokenRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.AfterCommit;
import com.clinic.util.QueueOrder;
import com.clinic.util.VnTime;
import com.clinic.view.Json;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Thông báo cho bệnh nhân: lưu vào hộp thư trong app, báo ngay qua WebSocket ({@code notification:new}) và đẩy về điện
 * thoại qua dịch vụ Expo Push nếu máy đã đăng ký token.
 * <ul>
 *   <li>CALLED: bác sĩ gọi (hoặc gọi lại) số của bệnh nhân</li>
 *   <li>RESULTS_READY: có kết quả cận lâm sàng, mời quay lại phòng khám (chế độ quay lại)</li>
 *   <li>VISIT_DONE: khám xong: kết luận, đơn thuốc, kết quả đã có trên app (chế độ nhận online)</li>
 *   <li>APPOINTMENT_REMINDER: nhắc lịch hẹn trước một ngày và trước một giờ ({@link AppointmentReminder})</li>
 * </ul>
 * Gửi thông báo không bao giờ làm hỏng thao tác chính: chạy sau khi dữ liệu đã ghi xong, ở luồng riêng, lỗi chỉ ghi log.
 */
@Service
public class NotificationsService {
  private static final Logger log = LoggerFactory.getLogger("Notifications");

  private final NotificationRepository notifications;
  private final PushTokenRepository pushTokens;
  private final VisitRepository visits;
  private final LabOrderRepository labOrders;
  private final RealtimeService realtime;
  private final ExpoPushClient push;
  private final TaskExecutor executor;
  private final TransactionTemplate tx;
  private final AppointmentRepository appointments;

  public NotificationsService(NotificationRepository notifications, PushTokenRepository pushTokens, VisitRepository visits,
      LabOrderRepository labOrders, RealtimeService realtime, ExpoPushClient push, @Qualifier("notificationExecutor") TaskExecutor executor,
      PlatformTransactionManager txm, AppointmentRepository appointments) {
    this.appointments = appointments;
    this.notifications = notifications;
    this.pushTokens = pushTokens;
    this.visits = visits;
    this.labOrders = labOrders;
    this.realtime = realtime;
    this.push = push;
    this.executor = executor;
    this.tx = new TransactionTemplate(txm);
    tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /** Nội dung một thông báo mới. */
  public record NewNotification(NotificationType type, String title, String body, String url, String visitId, String appointmentId) {}

  public static String doctorLabel(Doctor d) {
    return "bác sĩ " + d.getUser().getFullName();
  }

  private static Map<String, Object> listView(Notification n) {
    return Json.obj("id", n.getId(), "type", n.getType(), "title", n.getTitle(), "body", n.getBody(), "url", n.getUrl(),
        "visitId", n.getVisitId(), "appointmentId", n.getAppointmentId(), "readAt", n.getReadAt(), "createdAt", n.getCreatedAt());
  }

  /** Lưu thông báo, báo qua WebSocket rồi đẩy về các máy của người đó. */
  public Map<String, Object> notify(String userId, NewNotification n) {
    Map<String, Object> row = tx.execute(s -> {
      Notification e = new Notification();
      e.setUserId(userId);
      e.setType(n.type());
      e.setTitle(n.title());
      e.setBody(n.body());
      e.setUrl(n.url());
      e.setVisitId(n.visitId());
      e.setAppointmentId(n.appointmentId());
      return listView(notifications.saveAndFlush(e));
    });
    realtime.toUser(userId, "notification:new", row);
    try {
      pushTo(userId, row);
    } catch (Exception e) {
      if (e instanceof InterruptedException) Thread.currentThread().interrupt();
      log.warn("Không đẩy được thông báo: {}", e.toString());
    }
    return row;
  }

  private void pushTo(String userId, Map<String, Object> n) throws java.io.IOException, InterruptedException {
    List<PushToken> tokens = pushTokens.findByUserId(userId);
    if (tokens.isEmpty()) return;
    List<Map<String, Object>> messages = new ArrayList<>();
    for (PushToken t : tokens) {
      messages.add(Json.obj("to", t.getToken(), "title", n.get("title"), "body", n.get("body"),
          "data", Json.obj("url", n.get("url"), "notificationId", n.get("id"), "type", n.get("type")),
          "sound", "default", "priority", "high", "channelId", "default"));
    }
    List<JsonNode> tickets = push.send(messages);
    // Máy đã gỡ app hoặc tắt thông báo: bỏ token để lần sau không gửi nữa
    List<String> dead = new ArrayList<>();
    for (int i = 0; i < tokens.size() && i < tickets.size(); i++) {
      if ("DeviceNotRegistered".equals(tickets.get(i).path("details").path("error").asText())) dead.add(tokens.get(i).getToken());
    }
    if (!dead.isEmpty()) tx.executeWithoutResult(s -> pushTokens.deleteTokens(dead));
  }

  /** Chạy sau khi transaction hiện tại ghi xong, ở luồng riêng (không làm chậm API). */
  private void later(Runnable task) {
    AfterCommit.run(() -> executor.execute(() -> {
      try {
        task.run();
      } catch (RuntimeException e) {
        log.warn("Gửi thông báo lỗi: {}", e.toString());
      }
    }));
  }

  /** Gửi một thông báo sau khi transaction hiện tại ghi xong (không làm chậm API). */
  public void notifyLater(String userId, NewNotification n) {
    if (userId == null) return;
    later(() -> notify(userId, n));
  }

  // ---- Các sự kiện của lượt khám ----

  /** Thông tin lượt khám cần để soạn thông báo. */
  private record VisitInfo(String userId, String label, Doctor doctor, ResultMode resultMode, long labOrders) {}

  private VisitInfo load(String visitId) {
    return tx.execute(s -> {
      Visit v = visits.findById(visitId).orElse(null);
      if (v == null || v.getPatient().getUserId() == null) return null;
      Doctor d = v.getDoctor();
      d.getUser().getFullName();
      return new VisitInfo(v.getPatient().getUserId(), QueueOrder.ticketLabel(v.getSource(), v.getQueueNumber()), d, v.getResultMode(),
          labOrders.countByVisitId(visitId));
    });
  }

  private static String room(Doctor d) {
    String r = d.getRoom() == null ? "" : d.getRoom().trim();
    return r.isEmpty() ? null : r;
  }

  /** Bác sĩ gọi số: "Đến lượt bạn: số B01, mời vào Phòng 2". */
  public void called(String visitId, boolean recall) {
    later(() -> {
      VisitInfo v = load(visitId);
      if (v == null) return;
      String where = room(v.doctor()) != null ? room(v.doctor()) : "phòng khám " + doctorLabel(v.doctor());
      notify(v.userId(), new NewNotification(NotificationType.CALLED,
          recall ? "Bác sĩ đang gọi lại số " + v.label() : "Đến lượt bạn: số " + v.label(), "Mời bạn vào " + where + ".", "/ticket", visitId, null));
    });
  }

  /** Có kết quả cận lâm sàng, bệnh nhân quay lại để bác sĩ đọc kết quả (được gọi trước). */
  public void resultsReady(String visitId) {
    later(() -> {
      VisitInfo v = load(visitId);
      if (v == null) return;
      String where = room(v.doctor()) != null ? room(v.doctor()) : "phòng khám";
      notify(v.userId(), new NewNotification(NotificationType.RESULTS_READY, "Đã có kết quả cận lâm sàng",
          "Mời bạn quay lại " + where + " để " + doctorLabel(v.doctor()) + " đọc kết quả. Bạn sẽ được gọi trước.", "/ticket", visitId, null));
    });
  }

  /** Khám xong: bệnh án, đơn thuốc (và kết quả nếu nhận online) đã có trong app. */
  public void visitDone(String visitId) {
    later(() -> {
      VisitInfo v = load(visitId);
      if (v == null) return;
      boolean online = v.resultMode() == ResultMode.ONLINE;
      String body = online
          ? doctorLabel(v.doctor()) + " đã gửi kết quả cận lâm sàng, kết luận và đơn thuốc. Bấm để xem."
          : "Chẩn đoán" + (v.labOrders() > 0 ? ", kết quả cận lâm sàng" : "") + " và đơn thuốc của bạn đã có trong Lịch sử khám.";
      notify(v.userId(), new NewNotification(NotificationType.VISIT_DONE, online ? "Đã có kết quả khám" : "Đã lưu bệnh án lần khám", body,
          "/visit/" + visitId, visitId, null));
    });
  }

  // ---- Duyệt lịch đặt online ----

  /** Lễ tân duyệt / từ chối lịch đặt online: báo cho bệnh nhân. */
  public void appointmentReviewed(String appointmentId) {
    later(() -> {
      record Info(String userId, AppointmentStatus status, Instant start, Doctor doctor, String reason) {}
      Info a = tx.execute(s -> appointments.findById(appointmentId).map(x -> {
        Doctor d = x.getSchedule().getDoctor();
        d.getUser().getFullName();
        return new Info(x.getPatient().getUserId(), x.getStatus(), x.getSchedule().getStartTime(), d, x.getRejectReason());
      }).orElse(null));
      if (a == null || a.userId() == null) return;
      String when = VnTime.time(a.start()) + " ngày " + VnTime.dmy(VnTime.date(a.start()));
      if (a.status() == AppointmentStatus.CONFIRMED) {
        notify(a.userId(), new NewNotification(NotificationType.APPOINTMENT_CONFIRMED, "Lịch khám đã được xác nhận",
            when + " với " + doctorLabel(a.doctor()) + ". Đến quầy quét mã QR để check-in.", "/appointments", null, appointmentId));
      } else if (a.status() == AppointmentStatus.REJECTED) {
        notify(a.userId(), new NewNotification(NotificationType.APPOINTMENT_REJECTED, "Lịch khám không được xác nhận",
            "Lịch " + when + " với " + doctorLabel(a.doctor()) + " đã bị từ chối" + (a.reason() != null ? ": " + a.reason() : ".")
                + " Bạn có thể đặt giờ khác hoặc liên hệ phòng khám.", "/appointments", null, appointmentId));
      }
    });
  }

  // ---- Hộp thư ----

  @Transactional(readOnly = true)
  public Map<String, Object> mine(AuthUser user, Integer limit) {
    List<Map<String, Object>> items = notifications.latest(user.sub(), PageRequest.of(0, limit == null ? 30 : limit)).stream()
        .map(NotificationsService::listView).toList();
    return Json.obj("items", items, "unread", notifications.countByUserIdAndReadAtIsNull(user.sub()));
  }

  /** Đánh dấu đã đọc: theo danh sách id, theo lượt khám (mở chi tiết lần khám), hoặc tất cả; có thể lọc theo loại. */
  @Transactional
  public Map<String, Object> markRead(AuthUser user, List<String> ids, String visitId, Boolean all, List<NotificationType> types) {
    boolean everything = Boolean.TRUE.equals(all);
    if (!everything && (ids == null || ids.isEmpty()) && (visitId == null || visitId.isEmpty())) {
      throw ApiException.badRequest("Chọn thông báo cần đánh dấu đã đọc");
    }
    List<NotificationType> t = types == null || types.isEmpty() ? Arrays.asList(NotificationType.values()) : types;
    Instant now = Instant.now();
    if (everything) {
      notifications.readAll(user.sub(), t, now);
    } else if (visitId != null && !visitId.isEmpty()) {
      notifications.readOfVisit(user.sub(), visitId, t, now);
    } else {
      notifications.readIds(user.sub(), ids, t, now);
    }
    return Json.obj("unread", notifications.countByUserIdAndReadAtIsNull(user.sub()));
  }

  /** Máy vừa đăng nhập đăng ký token; máy dùng chung mà đổi tài khoản thì token chuyển sang tài khoản mới. */
  @Transactional
  public Map<String, Object> registerToken(AuthUser user, String token, String platform) {
    PushToken t = pushTokens.findById(token).orElseGet(PushToken::new);
    t.setToken(token);
    t.setUserId(user.sub());
    t.setPlatform(platform);
    pushTokens.saveAndFlush(t);
    return Json.obj("ok", true);
  }

  /** Đăng xuất: máy này thôi nhận thông báo của tài khoản. */
  @Transactional
  public Map<String, Object> removeToken(AuthUser user, String token) {
    pushTokens.findById(token).filter(t -> t.getUserId().equals(user.sub())).ifPresent(pushTokens::delete);
    return Json.obj("ok", true);
  }
}
