package com.clinic.service;

import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.CallRule;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.metrics.Metrics;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.LabOrderRepository;
import com.clinic.repository.Refresher;
import com.clinic.repository.VisitRepository;
import com.clinic.util.QueueOrder;
import com.clinic.util.QueueRules;
import com.clinic.util.VnTime;
import com.clinic.util.WalkInCapacity;
import com.clinic.view.Json;
import com.clinic.view.VisitViews;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Hàng đợi khám: cấp số, check-in lịch hẹn, gọi số theo thứ tự ưu tiên, dự đoán giờ được gọi.
 * Mỗi bước ghi dữ liệu chạy trong transaction riêng (giống bản cũ), các bước cần tránh tranh chấp dùng khóa
 * advisory của PostgreSQL theo (bác sĩ, ngày).
 */
@Service
public class QueueService {
  private static final long MINUTE = 60;
  public static final List<AppointmentStatus> ACTIVE = AppointmentsService.ACTIVE;

  private final VisitRepository visits;
  private final AppointmentRepository appointments;
  private final DoctorRepository doctors;
  private final LabOrderRepository labOrders;
  private final com.clinic.repository.ScheduleRepository schedules;
  private final RealtimeService realtime;
  private final NotificationsService notifications;
  private final JdbcTemplate jdbc;
  private final Refresher refresher;
  private final QueueRules rules;
  private final SettingsService settings;
  private final TransactionTemplate tx;

  public QueueService(VisitRepository visits, AppointmentRepository appointments, DoctorRepository doctors, LabOrderRepository labOrders,
      RealtimeService realtime, NotificationsService notifications, JdbcTemplate jdbc, Refresher refresher, QueueRules rules,
      PlatformTransactionManager txm, SettingsService settings, com.clinic.repository.ScheduleRepository schedules) {
    this.settings = settings;
    this.schedules = schedules;
    this.visits = visits;
    this.appointments = appointments;
    this.doctors = doctors;
    this.labOrders = labOrders;
    this.realtime = realtime;
    this.notifications = notifications;
    this.jdbc = jdbc;
    this.refresher = refresher;
    this.rules = rules;
    this.tx = new TransactionTemplate(txm);
  }

  public QueueRules rules() {
    return rules;
  }

  /** Thông tin cấp một số thứ tự. */
  public record TicketInput(String patientId, String doctorId, VisitSource source, CheckinMethod checkinMethod, String reason,
      String appointmentId, Instant appointmentAt, boolean checkinOverride, boolean overCapacity) {
    public TicketInput(String patientId, String doctorId, VisitSource source, CheckinMethod checkinMethod, String reason, String appointmentId,
        Instant appointmentAt, boolean checkinOverride) {
      this(patientId, doctorId, source, checkinMethod, reason, appointmentId, appointmentAt, checkinOverride, false);
    }

    public static TicketInput walkIn(String patientId, String doctorId, CheckinMethod method, String reason) {
      return walkIn(patientId, doctorId, method, reason, false);
    }

    /** overCapacity: lễ tân vẫn nhận dù bác sĩ đã kín ca (bác sĩ đồng ý khám thêm giờ) */
    public static TicketInput walkIn(String patientId, String doctorId, CheckinMethod method, String reason, boolean overCapacity) {
      return new TicketInput(patientId, doctorId, VisitSource.WALK_IN, method, reason, null, null, false, overCapacity);
    }
  }

  /** Sức chứa khách vãng lai hôm nay của một bác sĩ (theo các khung giờ đã mở và người vãng lai đang chờ). */
  public WalkInCapacity.Result capacity(String doctorId, Instant now) {
    LocalDate date = VnTime.today(now);
    List<WalkInCapacity.Slot> slots = schedules.findDay(doctorId, date).stream()
        .map(s -> new WalkInCapacity.Slot(s.getStartTime(), s.getEndTime(), s.isBooked())).toList();
    int walkIns = (int) visits.withStatus(doctorId, date, List.of(VisitStatus.WAITING, VisitStatus.IN_PROGRESS)).stream()
        .filter(v -> v.getSource() == VisitSource.WALK_IN).count();
    return WalkInCapacity.of(slots, now, walkIns, rules.avgExamMinutes());
  }

  /**
   * Mọi bác sĩ đang làm: có ca hôm nay không, ca hết lúc mấy giờ, còn nhận bao nhiêu khách vãng lai. accepting = còn
   * nhận (luôn true khi admin tắt giới hạn).
   */
  public List<Map<String, Object>> capacities(Instant now) {
    boolean limit = settings.walkInLimit();
    return tx.execute(s -> doctors.allActive().stream().map(d -> {
      WalkInCapacity.Result c = capacity(d.getId(), now);
      boolean open = c.hasShift() && !c.shiftOver(now) && c.remaining() > 0;
      return Json.obj("doctorId", d.getId(), "hasShift", c.hasShift(), "shiftEnd", c.shiftEnd(), "shiftOver", c.shiftOver(now),
          "waitingWalkIns", c.waitingWalkIns(), "remaining", c.remaining(), "accepting", !limit || open);
    }).toList());
  }

  /** Còn nhận khách vãng lai không; không thì báo lý do (không có ca, hết ca, kín lịch). */
  private void checkCapacity(Doctor doctor, Instant now) {
    WalkInCapacity.Result c = capacity(doctor.getId(), now);
    String who = NotificationsService.doctorLabel(doctor);
    Map<String, Object> extra = Json.obj("remaining", c.remaining(), "shiftEnd", c.shiftEnd(), "waitingWalkIns", c.waitingWalkIns());
    if (!c.hasShift()) {
      throw ApiException.conflictWithCode("DOCTOR_OFF", who + " hôm nay không có ca khám. Vui lòng chọn bác sĩ khác.", extra);
    }
    if (c.shiftOver(now)) {
      throw ApiException.conflictWithCode("DOCTOR_OFF", who + " đã hết ca khám hôm nay (ca kết thúc lúc " + VnTime.time(c.shiftEnd()) + "). Vui lòng chọn bác sĩ khác.",
          extra);
    }
    if (c.remaining() <= 0) {
      throw ApiException.conflictWithCode("DOCTOR_FULL", who + " đã kín lịch đến hết ca hôm nay (" + VnTime.time(c.shiftEnd()) + "), đang có "
          + c.waitingWalkIns() + " người vãng lai chờ. Vui lòng chọn bác sĩ khác.", extra);
    }
  }

  /** Một người trong hàng đợi, dùng cho thuật toán chọn thứ tự gọi. */
  private record Entry(Visit visit) implements QueueOrder.Entry {
    @Override
    public VisitSource source() {
      return visit.getSource();
    }

    @Override
    public int queueNumber() {
      return visit.getQueueNumber();
    }

    @Override
    public Instant createdAt() {
      return visit.getCreatedAt();
    }

    @Override
    public Instant appointmentAt() {
      return visit.getAppointmentAt();
    }

    @Override
    public Instant resultsReadyAt() {
      return visit.getResultsReadyAt();
    }
  }

  private void advisoryLock(String key) {
    jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))", (RowCallbackHandler) rs -> { }, key);
  }

  /** Phiếu khám dạng trả về cho client (kèm chỉ định cận lâm sàng, bệnh nhân, bác sĩ). Gọi trong transaction. */
  public Map<String, Object> view(Visit v) {
    return VisitViews.queue(v, labOrders.findByVisitIdOrderByCreatedAtAsc(v.getId()));
  }

  public Map<String, Object> viewById(String id) {
    return tx.execute(s -> view(visits.findById(id).orElseThrow()));
  }

  /**
   * Cấp số thứ tự trong dãy của nguồn đến (A = đặt lịch, B = vãng lai). Khóa advisory theo (bác sĩ, ngày) để các yêu
   * cầu cấp số cho cùng bác sĩ chạy lần lượt: đọc số lớn nhất rồi +1 không bị trùng. Ràng buộc unique
   * (doctorId, date, source, queueNumber) là lớp bảo vệ thứ hai.
   */
  public Map<String, Object> issueTicket(TicketInput input) {
    LocalDate date = VnTime.today(Instant.now());
    Map<String, Object> visit;
    try {
      visit = tx.execute(s -> {
        Doctor doctor = doctors.findById(input.doctorId()).orElse(null);
        if (doctor == null || !doctor.getUser().isActive()) throw ApiException.notFound("Không tìm thấy bác sĩ");
        advisoryLock("queue:" + input.doctorId() + ":" + date);
        // Vãng lai chỉ nhận khi bác sĩ có ca và còn thời gian rảnh trong ca (người đặt lịch đã có khung giờ riêng)
        if (input.source() == VisitSource.WALK_IN && !input.overCapacity() && settings.walkInLimit()) checkCapacity(doctor, Instant.now());

        // Mỗi bệnh nhân chỉ giữ một số đang chờ cho mỗi chuyên khoa trong ngày
        List<Visit> waiting = visits.waitingForSpecialty(input.patientId(), date, doctor.getSpecialtyId());
        if (!waiting.isEmpty()) {
          Visit w = waiting.get(0);
          throw ApiException.conflict("Bệnh nhân đang giữ số " + QueueOrder.ticketLabel(w.getSource(), w.getQueueNumber()) + " cho chuyên khoa này");
        }
        Visit v = new Visit();
        v.setPatientId(input.patientId());
        v.setDoctorId(input.doctorId());
        v.setDate(date);
        v.setQueueNumber(visits.maxNumber(input.doctorId(), date, input.source()) + 1);
        v.setSource(input.source());
        v.setCheckinMethod(input.checkinMethod());
        v.setReason(input.reason());
        v.setAppointmentId(input.appointmentId());
        v.setAppointmentAt(input.appointmentAt());
        v.setCheckinOverride(input.checkinOverride());
        visits.saveAndFlush(v);
        return view(refresher.refresh(v));
      });
    } catch (DataIntegrityViolationException e) {
      throw ApiException.conflict("Lịch hẹn này đã được check-in");
    }
    Metrics.QUEUE_TICKETS.labelValues(input.source().name()).inc();
    realtime.visitChanged((String) visit.get("id"));
    return visit;
  }

  /** Mở / đóng khung giờ check-in một lịch hẹn: từ giờ hẹn − CHECKIN_EARLY đến giờ hẹn + CHECKIN_LATE. */
  public Instant opens(Instant start) {
    return start.minusSeconds(rules.checkinEarlyMinutes() * MINUTE);
  }

  public Instant closes(Instant start) {
    return start.plusSeconds(rules.checkinLateMinutes() * MINUTE);
  }

  public String lateMessage(Instant start) {
    return "Đến trễ quá " + rules.checkinLateMinutes() + " phút so với giờ hẹn " + VnTime.time(start)
        + " nên lịch hẹn đã hết hiệu lực. Vui lòng lấy số thường.";
  }

  public String pendingMessage(Instant start) {
    return "Lịch hẹn lúc " + VnTime.time(start) + " chưa được phòng khám xác nhận. Vui lòng đến quầy lễ tân để được check-in.";
  }

  /** Lịch hẹn cần để check-in (đọc trong transaction). */
  private record ApptInfo(String id, String patientId, AppointmentStatus status, LocalDate date, Instant start, String doctorId, String reason,
      String visitLabel) {}

  /**
   * Check-in một lịch hẹn của hôm nay (lễ tân bấm hoặc bệnh nhân quét QR). Ngoài khung giờ thì từ chối; đến trễ thì
   * lịch hẹn thành "không đến". Lễ tân được check-in ngoài khung giờ ({@code override}), kể cả lịch đã bị tính là không đến.
   */
  public Map<String, Object> checkIn(String appointmentId, CheckinMethod method, String expectedPatientId, boolean override, Instant now) {
    ApptInfo appt = tx.execute(s -> appointments.findById(appointmentId).map(a -> new ApptInfo(a.getId(), a.getPatientId(), a.getStatus(),
        a.getSchedule().getDate(), a.getSchedule().getStartTime(), a.getSchedule().getDoctorId(), a.getReason(),
        visits.findByAppointmentId(a.getId()).map(v -> QueueOrder.ticketLabel(v.getSource(), v.getQueueNumber())).orElse(null))).orElse(null));
    if (appt == null || (expectedPatientId != null && !appt.patientId().equals(expectedPatientId))) {
      throw ApiException.notFound("Không tìm thấy lịch hẹn");
    }
    if (appt.visitLabel() != null) throw ApiException.conflict("Lịch hẹn đã được check-in, số thứ tự " + appt.visitLabel());
    if (!appt.date().equals(VnTime.today(now))) throw ApiException.conflict("Lịch hẹn không phải hôm nay");
    Instant start = appt.start();
    Instant opens = opens(start);
    Instant closes = closes(start);
    // Giờ hẹn và khung check-in gửi kèm lỗi để màn hình lễ tân tự diễn đạt
    Map<String, Object> times = Json.obj("appointmentAt", start, "opensAt", opens, "closesAt", closes);
    if (appt.status() == AppointmentStatus.NO_SHOW && !override) throw ApiException.conflictWithCode("CHECKIN_TOO_LATE", lateMessage(start), times);
    // Lịch chưa được duyệt: bệnh nhân không tự check-in được; lễ tân check-in tại quầy là duyệt luôn
    boolean pending = appt.status() == AppointmentStatus.PENDING;
    if (pending && method == CheckinMethod.QR) throw ApiException.conflictWithCode("APPOINTMENT_PENDING", pendingMessage(start), times);
    if (!List.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.NO_SHOW).contains(appt.status())) {
      throw ApiException.conflict("Lịch hẹn đã bị hủy hoặc đã xử lý");
    }

    boolean outside = now.isBefore(opens) || now.isAfter(closes);
    if (outside && !override) {
      if (now.isBefore(opens)) {
        throw ApiException.conflictWithCode("CHECKIN_TOO_EARLY", "Lịch hẹn lúc " + VnTime.time(start) + " mở check-in từ " + VnTime.time(opens)
            + ". Nếu cần khám sớm, vui lòng liên hệ quầy lễ tân.", times);
      }
      // Lịch chưa duyệt mà quá giờ không tính là bệnh nhân không đến
      tx.executeWithoutResult(s -> appointments.moveStatus(appt.id(), AppointmentsService.CONFIRMED, AppointmentStatus.NO_SHOW));
      throw ApiException.conflictWithCode("CHECKIN_TOO_LATE", lateMessage(start), times);
    }

    Map<String, Object> visit = issueTicket(new TicketInput(appt.patientId(), appt.doctorId(), VisitSource.ONLINE, method, appt.reason(), appt.id(),
        start, outside || appt.status() == AppointmentStatus.NO_SHOW));
    if (appt.status() == AppointmentStatus.NO_SHOW || pending) {
      tx.executeWithoutResult(s -> appointments.moveStatus(appt.id(), List.of(AppointmentStatus.NO_SHOW, AppointmentStatus.PENDING),
          AppointmentStatus.CONFIRMED));
    }
    return visit;
  }

  /** Hàng đợi hôm nay; lọc theo bác sĩ nếu có. Người đang chờ kèm thứ tự gọi dự kiến. */
  public List<Map<String, Object>> today(String doctorId, Instant now) {
    return tx.execute(s -> {
      List<Visit> list = visits.ofDay(VnTime.today(now), doctorId == null ? "" : doctorId);
      Map<String, QueueOrder.Predicted<Entry>> predicted = new HashMap<>();
      for (String id : new LinkedHashSet<>(list.stream().map(Visit::getDoctorId).toList())) {
        for (QueueOrder.Predicted<Entry> p : forecast(list.stream().filter(v -> v.getDoctorId().equals(id)).toList(), now).predicted()) {
          predicted.put(p.entry().visit().getId(), p);
        }
      }
      List<Map<String, Object>> out = new ArrayList<>();
      for (Visit v : list) {
        Map<String, Object> m = view(v);
        QueueOrder.Predicted<Entry> p = predicted.get(v.getId());
        m.put("predictedOrder", p == null ? null : p.order());
        m.put("estimatedCallAt", p == null ? null : p.estimatedAt());
        m.put("due", v.getStatus() == VisitStatus.WAITING && QueueOrder.isDue(new Entry(v), now, rules));
        out.add(m);
      }
      return out;
    });
  }

  /** Bác sĩ gọi số tiếp theo theo thứ tự ưu tiên (xem QueueOrder). */
  public Map<String, Object> callNext(String doctorId, Instant now) {
    return callNext(doctorId, now, false);
  }

  /**
   * Gọi số tiếp theo. Khi phòng khám bật "đo sinh hiệu trước khi khám", chỉ xét người đã đo (hoặc quay lại đọc kết quả
   * cận lâm sàng); {@code skipVitals} = bác sĩ chủ động gọi không chờ đo (cấp cứu, điều dưỡng vắng).
   */
  public Map<String, Object> callNext(String doctorId, Instant now, boolean skipVitals) {
    boolean needVitals = !skipVitals && settings.vitalsBeforeExam();
    return call(doctorId, now, date -> {
      List<Visit> all = visits.withStatus(doctorId, date, List.of(VisitStatus.WAITING));
      if (all.isEmpty()) throw ApiException.notFound("Không còn bệnh nhân nào đang chờ");
      List<Entry> waiting = all.stream().filter(v -> !needVitals || v.getVitalsMeasuredAt() != null || v.getResultsReadyAt() != null).map(Entry::new)
          .toList();
      if (waiting.isEmpty()) {
        throw ApiException.conflictWithCode("VITALS_NOT_READY", "Còn " + all.size() + " bệnh nhân đang chờ nhưng chưa ai đo sinh hiệu xong",
            Json.obj("waiting", all.size()));
      }
      QueueOrder.Pick<Entry> pick = QueueOrder.pickNext(waiting, streak(doctorId, date), now, rules);
      if (pick == null) throw ApiException.notFound("Không còn bệnh nhân nào đang chờ");
      return new Choice(pick.entry().visit().getId(), pick.rule());
    });
  }

  /** Bác sĩ chọn đích danh một người đang chờ (người già yếu, trẻ sốt cao, xem lại kết quả…). */
  public Map<String, Object> callVisit(String doctorId, String visitId, Instant now) {
    return call(doctorId, now, date -> {
      Visit v = visits.findById(visitId).orElse(null);
      if (v == null || !v.getDoctorId().equals(doctorId) || !v.getDate().equals(date)) throw ApiException.notFound("Không tìm thấy phiếu khám");
      if (v.getStatus() != VisitStatus.WAITING) {
        throw ApiException.conflict("Số " + QueueOrder.ticketLabel(v.getSource(), v.getQueueNumber()) + " không còn trong hàng chờ");
      }
      return new Choice(v.getId(), CallRule.MANUAL);
    });
  }

  private record Choice(String id, CallRule rule) {}

  private Map<String, Object> call(String doctorId, Instant now, Function<LocalDate, Choice> choose) {
    LocalDate date = VnTime.today(now);
    Map<String, Object> visit = tx.execute(s -> {
      advisoryLock("call:" + doctorId + ":" + date);
      List<Visit> current = visits.withStatus(doctorId, date, List.of(VisitStatus.IN_PROGRESS));
      if (!current.isEmpty()) {
        Visit c = current.get(0);
        throw ApiException.conflict("Bạn đang khám số " + QueueOrder.ticketLabel(c.getSource(), c.getQueueNumber()) + ", hãy hoàn tất trước khi gọi tiếp");
      }
      Choice c = choose.apply(date);
      Visit v = visits.findById(c.id()).orElseThrow();
      v.setStatus(VisitStatus.IN_PROGRESS);
      v.setCalledAt(now);
      v.setCallRule(c.rule());
      visits.saveAndFlush(v);
      return view(v);
    });
    // Sau khi giao dịch xong: loa ở quầy đọc số, app của bệnh nhân báo đến lượt
    String id = (String) visit.get("id");
    realtime.called(id, false);
    notifications.called(id, false);
    return visit;
  }

  /** Gọi lại số đang khám (bệnh nhân chưa vào): loa đọc lại, không đổi thứ tự hàng chờ. */
  public Map<String, Object> recall(String doctorId, String visitId) {
    Map<String, Object> visit = tx.execute(s -> {
      Visit v = visits.findById(visitId).orElse(null);
      if (v == null || !v.getDoctorId().equals(doctorId)) throw ApiException.notFound("Không tìm thấy phiếu khám");
      if (v.getStatus() != VisitStatus.IN_PROGRESS) throw ApiException.conflict("Chỉ gọi lại được số đang khám");
      return view(v);
    });
    realtime.called(visitId, true);
    notifications.called(visitId, true);
    return visit;
  }

  /** Số lượt liên tiếp gần nhất gọi người đặt lịch đến giờ hẹn. */
  private int streak(String doctorId, LocalDate date) {
    return QueueOrder.currentStreak(visits.called(doctorId, date, PageRequest.of(0, 50)).stream().map(Visit::getCallRule).toList());
  }

  /** Dự đoán thứ tự gọi và người đang khám. */
  private record Forecast(List<QueueOrder.Predicted<Entry>> predicted, Visit current) {}

  /** Dự đoán thứ tự gọi từ toàn bộ phiếu trong ngày của một bác sĩ. */
  private Forecast forecast(List<Visit> list, Instant now) {
    List<Entry> waiting = list.stream().filter(v -> v.getStatus() == VisitStatus.WAITING).map(Entry::new).toList();
    Visit current = list.stream().filter(v -> v.getStatus() == VisitStatus.IN_PROGRESS).findFirst().orElse(null);
    List<CallRule> recent = list.stream().filter(v -> v.getCalledAt() != null)
        .sorted(Comparator.comparing(Visit::getCalledAt).reversed()).map(Visit::getCallRule).toList();
    Instant busyUntil = current == null ? null
        : (current.getCalledAt() != null ? current.getCalledAt() : now).plusSeconds(rules.avgExamMinutes() * MINUTE);
    return new Forecast(QueueOrder.predictOrder(waiting, QueueOrder.currentStreak(recent), now, rules, busyUntil), current);
  }

  /** Đánh dấu bệnh nhân bỏ về (không có mặt khi gọi số). */
  public Map<String, Object> markLeft(String visitId, String doctorId) {
    Map<String, Object> out = tx.execute(s -> {
      Visit v = visits.findById(visitId).orElse(null);
      if (v == null || (doctorId != null && !v.getDoctorId().equals(doctorId))) throw ApiException.notFound("Không tìm thấy phiếu khám");
      int count = visits.moveStatus(visitId, List.of(VisitStatus.WAITING, VisitStatus.IN_PROGRESS, VisitStatus.AWAITING_RESULTS), VisitStatus.LEFT);
      if (count == 0) throw ApiException.conflict("Phiếu khám đã kết thúc");
      if (v.getAppointmentId() != null) {
        Appointment a = appointments.findById(v.getAppointmentId()).orElseThrow();
        a.setStatus(AppointmentStatus.NO_SHOW);
        appointments.saveAndFlush(a);
      }
      return view(visits.findById(visitId).orElseThrow());
    });
    realtime.visitChanged(visitId);
    return out;
  }

  /**
   * Cho màn hình "Số thứ tự của tôi": số người được gọi trước, giờ dự kiến được gọi và số đang khám. Tính bằng đúng
   * quy tắc gọi số nên khớp với thực tế.
   */
  public Map<String, Object> position(String visitId, String patientId, Instant lockedBefore, Instant now) {
    return tx.execute(s -> {
      Visit visit = visits.findById(visitId).orElse(null);
      if (visit == null || (patientId != null && !visit.getPatientId().equals(patientId))) throw ApiException.notFound("Không tìm thấy phiếu khám");
      if (lockedBefore != null && visit.getCreatedAt().isBefore(lockedBefore)) throw ApiException.notFound("Không tìm thấy phiếu khám");
      List<Visit> sameDay = new ArrayList<>(visits.withStatus(visit.getDoctorId(), visit.getDate(), List.of(VisitStatus.WAITING, VisitStatus.IN_PROGRESS)));
      sameDay.addAll(visits.recentlyCalled(visit.getDoctorId(), visit.getDate(), List.of(VisitStatus.WAITING, VisitStatus.IN_PROGRESS),
          PageRequest.of(0, 50)));
      Forecast f = forecast(sameDay, now);
      QueueOrder.Predicted<Entry> mine = f.predicted().stream().filter(p -> p.entry().visit().getId().equals(visit.getId())).findFirst().orElse(null);
      Visit current = f.current();
      return Json.obj(
          "visit", view(visit),
          "peopleAhead", mine == null ? 0 : mine.order(),
          "estimatedCallAt", mine == null ? null : mine.estimatedAt(),
          // Người đặt lịch đã đến giờ hẹn (được ưu tiên ngay)
          "due", visit.getStatus() == VisitStatus.WAITING && QueueOrder.isDue(new Entry(visit), now, rules),
          "current", current == null ? null : Json.obj("queueNumber", current.getQueueNumber(), "source", current.getSource()),
          "label", QueueOrder.ticketLabel(visit.getSource(), visit.getQueueNumber()),
          "currentLabel", current == null ? null : QueueOrder.ticketLabel(current.getSource(), current.getQueueNumber()));
    });
  }

  public String doctorIdOf(String userId) {
    return doctors.findByUserId(userId).map(Doctor::getId).orElseThrow(() -> ApiException.forbidden("Tài khoản không gắn với bác sĩ nào"));
  }
}
