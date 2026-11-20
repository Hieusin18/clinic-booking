package com.clinic.controller;

import com.clinic.config.AppEnv;
import com.clinic.entity.Appointment;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.service.AppointmentsService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.PatientScope;
import com.clinic.service.QueueService;
import com.clinic.util.QrToken;
import com.clinic.util.VnTime;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "queue")
@RestController
@RequestMapping("/queue")
public class QueueController {
  /** Thông báo khi quét QR mà hôm nay chưa có lịch hẹn còn hiệu lực */
  public static final String NEEDS_DOCTOR = "Bạn chưa đặt lịch hôm nay, vui lòng chọn bác sĩ";

  private final QueueService queue;
  private final com.clinic.service.VitalsService vitals;
  private final AppointmentRepository appointments;
  private final VisitRepository visits;
  private final PatientScope scope;
  private final AppEnv env;
  private final TransactionTemplate tx;

  public QueueController(QueueService queue, AppointmentRepository appointments, VisitRepository visits, PatientScope scope, AppEnv env,
      PlatformTransactionManager txm,
      com.clinic.service.VitalsService vitals) {
    this.vitals = vitals;
    this.queue = queue;
    this.appointments = appointments;
    this.visits = visits;
    this.scope = scope;
    this.env = env;
    this.tx = new TransactionTemplate(txm);
  }

  /**
   * @param token chuỗi đọc được từ mã QR ở quầy
   * @param doctorId bắt buộc khi chưa đặt lịch hôm nay
   */
  public record ScanRequest(@NotNull String token, String doctorId, @Size(max = 500) String reason) {}

  public record WalkInRequest(@NotNull String patientId, @NotNull String doctorId, @Size(max = 500) String reason) {}

  /** @param override lễ tân check-in ngoài khung giờ (đến quá sớm hoặc quá trễ) */
  public record CheckInRequest(@NotNull String appointmentId, Boolean override) {}

  /** Lịch hẹn hôm nay (đọc trong transaction): id và giờ hẹn. */
  private record Booked(String id, Instant start) {}

  /**
   * Bệnh nhân quét QR tại quầy: có lịch hẹn hôm nay trong khung check-in thì tự check-in; đến quá sớm thì báo giờ mở
   * check-in; đến quá trễ hoặc chưa đặt lịch thì lấy số thường với bác sĩ đã chọn.
   */
  @Roles(Role.PATIENT)
  @PostMapping("/scan")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> scan(@CurrentUser AuthUser user, @Valid @RequestBody ScanRequest dto) {
    QrToken.Check check = QrToken.verify(dto.token(), env.require("QR_SECRET"), env.require("CLINIC_ID"), env.getInt("QR_TTL_SECONDS", 60),
        System.currentTimeMillis());
    if (!check.ok()) {
      throw ApiException.badRequest("expired".equals(check.reason()) ? "Mã QR đã hết hạn, vui lòng quét lại mã trên màn hình" : "Mã QR không hợp lệ");
    }
    Instant now = Instant.now();
    String patientId = scope.patientIdOf(user);
    // Chỉ lịch đã được lễ tân duyệt mới tự check-in bằng QR
    List<Booked> booked = tx.execute(s -> appointments.openToday(patientId, AppointmentsService.CONFIRMED, VnTime.today(now)).stream()
        .map((Appointment a) -> new Booked(a.getId(), a.getSchedule().getStartTime())).toList());
    Booked open = booked.stream().filter(a -> !now.isBefore(queue.opens(a.start())) && !now.isAfter(queue.closes(a.start()))).findFirst().orElse(null);
    if (open != null) return queue.checkIn(open.id(), CheckinMethod.QR, patientId, false, now);
    // Còn lịch hẹn chưa đến giờ: checkIn báo giờ mở check-in
    Booked early = booked.stream().filter(a -> now.isBefore(queue.opens(a.start()))).findFirst().orElse(null);
    if (early != null) return queue.checkIn(early.id(), CheckinMethod.QR, patientId, false, now);

    // Lịch còn chờ duyệt chưa quá giờ: mời ra quầy (lễ tân check-in là duyệt luôn)
    Booked waiting = tx.execute(s -> appointments.openToday(patientId, List.of(AppointmentStatus.PENDING), VnTime.today(now)).stream()
        .map((Appointment a) -> new Booked(a.getId(), a.getSchedule().getStartTime())).filter(a -> !now.isAfter(queue.closes(a.start()))).findFirst()
        .orElse(null));
    if (waiting != null) {
      throw ApiException.conflictWithCode("APPOINTMENT_PENDING", queue.pendingMessage(waiting.start()),
          com.clinic.view.Json.obj("appointmentAt", waiting.start(), "opensAt", queue.opens(waiting.start()), "closesAt", queue.closes(waiting.start())));
    }

    // Còn lại là lịch đã quá giờ: tính là không đến, bệnh nhân lấy số thường
    Booked late = booked.isEmpty() ? null : booked.get(booked.size() - 1);
    if (late != null) {
      tx.executeWithoutResult(s -> appointments.moveStatusAll(booked.stream().map(Booked::id).toList(), AppointmentsService.CONFIRMED,
          AppointmentStatus.NO_SHOW));
    }
    if (dto.doctorId() == null || dto.doctorId().isEmpty()) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("statusCode", 400);
      body.put("error", "Bad Request");
      body.put("code", "NEEDS_DOCTOR");
      body.put("message", late != null ? queue.lateMessage(late.start()) + " Chọn bác sĩ để lấy số." : NEEDS_DOCTOR);
      throw new ApiException(HttpStatus.BAD_REQUEST, body);
    }
    return queue.issueTicket(QueueService.TicketInput.walkIn(patientId, dto.doctorId(), CheckinMethod.QR, dto.reason()));
  }

  /** Phiếu khám hôm nay của bệnh nhân đang đăng nhập */
  @Roles(Role.PATIENT)
  @GetMapping("/mine")
  public List<Map<String, Object>> mine(@CurrentUser AuthUser user) {
    PatientScope.Scope s = scope.scopeOf(user);
    return tx.execute(t -> visits.ofPatientOnDay(s.patientId(), VnTime.today(Instant.now()), s.visibleFrom()).stream().map(queue::view).toList());
  }

  @Roles({Role.PATIENT, Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR})
  @GetMapping("/{visitId}/position")
  public Map<String, Object> position(@CurrentUser AuthUser user, @PathVariable String visitId) {
    PatientScope.Scope s = user.role() == Role.PATIENT ? scope.scopeOf(user) : null;
    return queue.position(visitId, s == null ? null : s.patientId(), s == null ? null : s.lockedBefore(), Instant.now());
  }

  /** Lễ tân cấp số cho bệnh nhân đến trực tiếp (không dùng app) */
  @Roles(Role.RECEPTIONIST)
  @PostMapping("/tickets")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> walkIn(@Valid @RequestBody WalkInRequest dto) {
    return queue.issueTicket(QueueService.TicketInput.walkIn(dto.patientId(), dto.doctorId(), CheckinMethod.RECEPTION, dto.reason()));
  }

  /** Lễ tân check-in cho bệnh nhân đã đặt lịch; override = cho phép ngoài khung giờ */
  @Roles(Role.RECEPTIONIST)
  @PostMapping("/checkin")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> checkIn(@Valid @RequestBody CheckInRequest dto) {
    return queue.checkIn(dto.appointmentId(), CheckinMethod.RECEPTION, null, Boolean.TRUE.equals(dto.override()), Instant.now());
  }

  /** Hàng đợi hôm nay của cả phòng khám (lọc theo bác sĩ) */
  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping("/today")
  public List<Map<String, Object>> today(@RequestParam(required = false) String doctorId) {
    return queue.today(doctorId, Instant.now());
  }

  /** Hàng đợi hôm nay của bác sĩ đang đăng nhập */
  @Roles(Role.DOCTOR)
  @GetMapping("/doctor")
  public List<Map<String, Object>> doctorQueue(@CurrentUser AuthUser user) {
    // Kèm sinh hiệu điều dưỡng đã đo để bác sĩ biết ai đã đo
    return vitals.attach(queue.today(queue.doctorIdOf(user.sub()), Instant.now()));
  }

  /** Gọi số tiếp theo theo thứ tự ưu tiên */
  @Roles(Role.DOCTOR)
  @PostMapping("/call-next")
  public Map<String, Object> callNext(@CurrentUser AuthUser user) {
    return queue.callNext(queue.doctorIdOf(user.sub()), Instant.now());
  }

  /** Bác sĩ gọi đích danh một người đang chờ, bỏ qua thứ tự ưu tiên */
  @Roles(Role.DOCTOR)
  @PostMapping("/{visitId}/call")
  public Map<String, Object> call(@CurrentUser AuthUser user, @PathVariable String visitId) {
    return queue.callVisit(queue.doctorIdOf(user.sub()), visitId, Instant.now());
  }

  /** Gọi lại số đang khám (bệnh nhân chưa vào phòng): loa ở quầy đọc lại */
  @Roles(Role.DOCTOR)
  @PostMapping("/{visitId}/recall")
  public Map<String, Object> recall(@CurrentUser AuthUser user, @PathVariable String visitId) {
    return queue.recall(queue.doctorIdOf(user.sub()), visitId);
  }

  /** Đánh dấu bỏ về; bác sĩ chỉ đánh dấu được bệnh nhân của mình */
  @Roles({Role.DOCTOR, Role.RECEPTIONIST})
  @PatchMapping("/{visitId}/left")
  public Map<String, Object> markLeft(@CurrentUser AuthUser user, @PathVariable String visitId) {
    String doctorId = user.role() == Role.DOCTOR ? queue.doctorIdOf(user.sub()) : null;
    return queue.markLeft(visitId, doctorId);
  }
}
