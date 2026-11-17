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
  public static final List<AppointmentStatus> ACTIVE = List.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED);
  private static final long MINUTE = 60;

  private final AppointmentRepository appointments;
  private final ScheduleRepository schedules;
  private final VisitRepository visits;
  private final PatientScope scope;
  private final RealtimeService realtime;
  private final QueueRules rules;
  private final Refresher refresher;

  public AppointmentsService(AppointmentRepository appointments, ScheduleRepository schedules, VisitRepository visits, PatientScope scope,
      RealtimeService realtime, QueueRules rules, Refresher refresher) {
    this.refresher = refresher;
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
    a.setStatus(AppointmentStatus.CONFIRMED);
    appointments.saveAndFlush(a);
    Metrics.APPOINTMENTS_BOOKED.inc();
    // Lễ tân thấy ngay lịch hẹn mới trong danh sách hôm nay
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
        ? appointments.upcoming(s.patientId(), s.lockedBefore(), ACTIVE, cutoff)
        : appointments.past(s.patientId(), s.lockedBefore(), ACTIVE, cutoff);
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

  /** Khung giờ được check-in của lịch hẹn (để app và lễ tân nhắc giờ). */
  public Map<String, Object> withWindow(Map<String, Object> m, Instant start) {
    m.put("checkinOpensAt", start.minusSeconds(rules.checkinEarlyMinutes() * MINUTE));
    m.put("checkinClosesAt", start.plusSeconds(rules.checkinLateMinutes() * MINUTE));
    return m;
  }
}
