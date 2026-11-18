package com.clinic.service;

import com.clinic.entity.Appointment;
import com.clinic.entity.Schedule;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.exception.ApiException;
import com.clinic.metrics.Metrics;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.Refresher;
import com.clinic.repository.ScheduleRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.QueueRules;
import com.clinic.util.VnTime;
import com.clinic.view.AppointmentViews;
import com.clinic.view.Json;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Đặt lịch (chống trùng, khóa người không đến), xem / hủy lịch của bệnh nhân, lịch trong ngày cho lễ tân. */
@Service
public class AppointmentsService {
  /** Lịch còn hiệu lực: chờ lễ tân duyệt hoặc đã duyệt. */
  public static final List<AppointmentStatus> ACTIVE = List.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED);
  /** Lịch đã được lễ tân duyệt: mới được tự check-in bằng QR, được nhắc lịch, bỏ hẹn mới tính là không đến. */
  public static final List<AppointmentStatus> CONFIRMED = List.of(AppointmentStatus.CONFIRMED);
  static final int REJECT_REASON_MAX = 300;
  private static final long MINUTE = 60;

  private final AppointmentRepository appointments;
  private final ScheduleRepository schedules;
  private final VisitRepository visits;
  private final PatientScope scope;
  private final RealtimeService realtime;
  private final QueueRules rules;
  private final Refresher refresher;
  private final NotificationsService notifications;

  public AppointmentsService(AppointmentRepository appointments, ScheduleRepository schedules, VisitRepository visits, PatientScope scope,
      RealtimeService realtime, QueueRules rules, Refresher refresher, NotificationsService notifications) {
    this.refresher = refresher;
    this.notifications = notifications;
    this.appointments = appointments;
    this.schedules = schedules;
    this.visits = visits;
    this.scope = scope;
    this.realtime = realtime;
    this.rules = rules;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> myStanding(AuthUser user) {
    return standing(scope.patientIdOf(user), Instant.now());
  }

  /**
   * Số lần không đến gần đây và hạn khóa đặt lịch online (nếu có).
   * App dùng để cảnh báo trước khi đặt; backend dùng để chặn khi đặt.
   */
  @Transactional(readOnly = true)
  public Map<String, Object> standing(String patientId, Instant now) {
    LocalDate today = VnTime.today(now);
    List<LocalDate> dates = appointments.noShowDates(patientId, today.minusDays((long) rules.noShowWindowDays() + rules.noShowLockDays()));
    QueueRules.NoShowStanding s = rules.noShowStanding(dates, today);
    return Json.obj(
        "recentNoShows", s.recentNoShows(),
        "limit", rules.noShowLimit(),
        "windowDays", rules.noShowWindowDays(),
        // Ngày cuối cùng bị khóa (YYYY-MM-DD), null = không bị khóa
        "lockedUntil", s.lockedUntil() == null ? null : s.lockedUntil().toString());
  }

  /**
   * Đặt lịch chống trùng: UPDATE chỉ đánh dấu isBooked khi khung giờ còn trống.
   * PostgreSQL khóa dòng khi cập nhật, nên hai yêu cầu đồng thời chỉ một bên cập nhật được 1 dòng.
   * Lịch mới ở trạng thái chờ duyệt (PENDING): lễ tân duyệt mới có hiệu lực, chặn việc dùng công cụ đặt lịch hàng loạt.
   */
  @Transactional
  public Map<String, Object> book(AuthUser user, String scheduleId, String reason) {
    String patientId = scope.patientIdOf(user);
    Map<String, Object> standing = standing(patientId, Instant.now());
    Object lockedUntil = standing.get("lockedUntil");
    if (lockedUntil != null) {
      throw ApiException.forbidden("Bạn đã không đến khám " + rules.noShowLimit() + " lần trong " + rules.noShowWindowDays()
          + " ngày nên tạm thời không đặt lịch online được đến hết ngày " + VnTime.dmy(LocalDate.parse((String) lockedUntil))
          + ". Bạn vẫn có thể đến phòng khám lấy số trực tiếp.");
    }
    Schedule slot = schedules.findById(scheduleId).orElseThrow(() -> ApiException.notFound("Không tìm thấy khung giờ"));
    if (!slot.getStartTime().isAfter(Instant.now())) throw ApiException.conflict("Khung giờ đã qua, vui lòng chọn giờ khác");
    if (appointments.existsSameDay(patientId, ACTIVE, slot.getDoctorId(), slot.getDate())) {
      throw ApiException.conflict("Bạn đã có lịch với bác sĩ này trong ngày");
    }
    if (schedules.book(slot.getId(), Instant.now()) == 0) throw ApiException.conflict("Khung giờ này vừa có người đặt, vui lòng chọn giờ khác");
    Appointment a = new Appointment();
    a.setPatientId(patientId);
    a.setScheduleId(slot.getId());
    a.setReason(reason);
    a.setStatus(AppointmentStatus.PENDING);
    appointments.saveAndFlush(a);
    Metrics.APPOINTMENTS_BOOKED.inc();
    // Lễ tân thấy ngay lịch mới trong danh sách chờ duyệt
    realtime.staffChanged();
    return AppointmentViews.view(refresher.refresh(a));
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> mine(AuthUser user, String when) {
    PatientScope.Scope s = scope.scopeOf(user);
    // Lịch hẹn còn check-in được (chưa quá giờ hẹn + CHECKIN_LATE) vẫn tính là sắp tới
    Instant cutoff = Instant.now().minusSeconds(rules.checkinLateMinutes() * MINUTE);
    boolean upcoming = when == null || "upcoming".equals(when);
    List<Appointment> list = upcoming
        ? appointments.upcoming(s.patientId(), s.visibleFrom(), ACTIVE, cutoff)
        : appointments.past(s.patientId(), s.visibleFrom(), ACTIVE, cutoff);
    // Khung giờ check-in để app nhắc bệnh nhân đến đúng lúc
    return list.stream().map(a -> withWindow(AppointmentViews.view(a), a.getSchedule().getStartTime())).toList();
  }

  /** Bệnh nhân hủy lịch của mình trước giờ khám; khung giờ được mở lại cho người khác. */
  @Transactional
  public Map<String, Object> cancel(AuthUser user, String id) {
    String patientId = scope.patientIdOf(user);
    Appointment appt = appointments.findById(id).filter(a -> a.getPatientId().equals(patientId))
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy lịch hẹn"));
    if (!ACTIVE.contains(appt.getStatus())) throw ApiException.conflict("Lịch hẹn này đã được xử lý");
    if (visits.findByAppointmentId(id).isPresent()) throw ApiException.conflict("Bạn đã check-in, không hủy được lịch");
    if (!appt.getSchedule().getStartTime().isAfter(Instant.now())) throw ApiException.conflict("Không hủy được lịch đã qua giờ khám");
    schedules.release(appt.getScheduleId());
    appt = appointments.findById(id).orElseThrow();
    appt.setStatus(AppointmentStatus.CANCELLED);
    appointments.saveAndFlush(appt);
    realtime.staffChanged();
    return AppointmentViews.view(appt);
  }

  /** Lịch hẹn trong ngày của cả phòng khám (lễ tân dùng để check-in, kể cả lịch đã bị tính không đến). */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> byDay(String date) {
    LocalDate day = date != null ? LocalDate.parse(date.substring(0, 10)) : VnTime.today(Instant.now());
    List<AppointmentStatus> statuses = List.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED,
        AppointmentStatus.NO_SHOW);
    return appointments.byDay(statuses, day).stream().map(a -> {
      Map<String, Object> m = AppointmentViews.view(a);
      Visit v = visits.findByAppointmentId(a.getId()).orElse(null);
      m.put("visit", v == null ? null : Json.obj("id", v.getId(), "queueNumber", v.getQueueNumber(), "source", v.getSource(), "status", v.getStatus()));
      return withWindow(m, a.getSchedule().getStartTime());
    }).toList();
  }

  // ---- Lễ tân duyệt lịch đặt online ----

  /**
   * Lịch đặt online đang chờ duyệt (chưa quá giờ khám), kèm thông tin để lễ tân đánh giá: tuổi, ngày tạo tài khoản, số lần đã khám / không đến / bị từ chối trước đây, số lịch đang chờ của cùng người.
   */
  @Transactional(readOnly = true)
  public Map<String, Object> pending() {
    Instant now = Instant.now();
    List<Appointment> list = appointments.pendingReview(now);
    Map<String, Long> waitingByPatient = new java.util.HashMap<>();
    for (Appointment a : list) waitingByPatient.merge(a.getPatientId(), 1L, Long::sum);
    List<Map<String, Object>> items = list.stream().map(a -> {
      Map<String, Object> m = withWindow(AppointmentViews.view(a), a.getSchedule().getStartTime());
      var p = a.getPatient();
      Map<String, Long> history = new java.util.HashMap<>();
      for (Object[] row : appointments.countByStatusOf(a.getPatientId())) history.put(String.valueOf(row[0]), (Long) row[1]);
      m.put("patientInfo", Json.obj(
          "dateOfBirth", p.getDateOfBirth(),
          "gender", p.getGender(),
          "accountCreatedAt", p.getUser() == null ? null : p.getUser().getCreatedAt(),
          "completed", history.getOrDefault("COMPLETED", 0L),
          "noShow", history.getOrDefault("NO_SHOW", 0L),
          "cancelled", history.getOrDefault("CANCELLED", 0L),
          "rejected", history.getOrDefault("REJECTED", 0L),
          "waiting", waitingByPatient.getOrDefault(a.getPatientId(), 0L)));
      return m;
    }).toList();
    return Json.obj("items", items, "total", items.size());
  }

  /** Số lịch đang chờ duyệt (số trên menu của lễ tân). */
  @Transactional(readOnly = true)
  public Map<String, Object> pendingCount() {
    return Json.obj("count", appointments.countPendingReview(Instant.now()));
  }

  /** Lễ tân duyệt lịch: lịch có hiệu lực, bệnh nhân nhận thông báo và được tự check-in bằng QR. */
  @Transactional
  public Map<String, Object> confirm(AuthUser staff, String id) {
    Appointment a = reviewable(id);
    a.setStatus(AppointmentStatus.CONFIRMED);
    a.setReviewedAt(Instant.now());
    a.setReviewedById(staff.sub());
    appointments.saveAndFlush(a);
    reviewed(a);
    return AppointmentViews.view(a);
  }

  /** Lễ tân từ chối lịch (vd. đặt hàng loạt, thông tin không rõ ràng): khung giờ được mở lại cho người khác. */
  @Transactional
  public Map<String, Object> reject(AuthUser staff, String id, String reason) {
    Appointment a = reviewable(id);
    String r = reason == null ? null : reason.trim();
    if (r != null && r.length() > REJECT_REASON_MAX) throw ApiException.badRequest("Lý do tối đa " + REJECT_REASON_MAX + " ký tự");
    schedules.release(a.getScheduleId());
    a = appointments.findById(id).orElseThrow();
    a.setStatus(AppointmentStatus.REJECTED);
    a.setRejectReason(r == null || r.isEmpty() ? null : r);
    a.setReviewedAt(Instant.now());
    a.setReviewedById(staff.sub());
    appointments.saveAndFlush(a);
    reviewed(a);
    return AppointmentViews.view(a);
  }

  private Appointment reviewable(String id) {
    Appointment a = appointments.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy lịch hẹn"));
    if (a.getStatus() != AppointmentStatus.PENDING) throw ApiException.conflict("Lịch hẹn này đã được xử lý");
    if (!a.getSchedule().getStartTime().isAfter(Instant.now().minusSeconds(rules.checkinLateMinutes() * MINUTE))) {
      throw ApiException.conflict("Lịch hẹn đã quá giờ khám");
    }
    return a;
  }

  private void reviewed(Appointment a) {
    realtime.staffChanged();
    String userId = a.getPatient().getUserId();
    if (userId != null) realtime.toUser(userId, "appointment:changed", Json.obj("appointmentId", a.getId(), "status", a.getStatus()));
    notifications.appointmentReviewed(a.getId());
  }

  /** Khung giờ được check-in của lịch hẹn (để app và lễ tân nhắc giờ). */
  public Map<String, Object> withWindow(Map<String, Object> m, Instant start) {
    m.put("checkinOpensAt", start.minusSeconds(rules.checkinEarlyMinutes() * MINUTE));
    m.put("checkinClosesAt", start.plusSeconds(rules.checkinLateMinutes() * MINUTE));
    return m;
  }
}
