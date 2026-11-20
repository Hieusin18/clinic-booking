package com.clinic.service;

import com.clinic.config.AppEnv;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.util.QueueRules;
import com.clinic.util.VnTime;
import com.clinic.view.Json;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Việc dọn hàng đợi chạy định kỳ (QUEUE_SWEEP_SECONDS, mặc định 5 phút; 0 = tắt):
 * <ul>
 *   <li>lịch hẹn quá giờ hẹn + CHECKIN_LATE_MINUTES mà chưa check-in → "không đến";</li>
 *   <li>sau QUEUE_DAY_END_HOUR (và mọi ngày đã qua), số còn đang chờ → "bỏ về".</li>
 * </ul>
 * Backend chỉ chạy một bản nên một luồng hẹn giờ là đủ.
 */
@Service
public class QueueJanitor {
  private static final Logger log = LoggerFactory.getLogger(QueueJanitor.class);

  private final AppointmentRepository appointments;
  private final VisitRepository visits;
  private final RealtimeService realtime;
  private final QueueRules rules;
  private final AppEnv env;
  private final TransactionTemplate tx;
  private ScheduledExecutorService timer;

  public QueueJanitor(AppointmentRepository appointments, VisitRepository visits, RealtimeService realtime, QueueRules rules, AppEnv env,
      PlatformTransactionManager txm) {
    this.tx = new TransactionTemplate(txm);
    this.appointments = appointments;
    this.visits = visits;
    this.realtime = realtime;
    this.rules = rules;
    this.env = env;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void start() {
    if ("true".equals(System.getProperty(com.clinic.ClinicBookingApplication.CLI_PROPERTY))) return;
    int seconds = env.getInt("QUEUE_SWEEP_SECONDS", 300);
    if (seconds <= 0) return;
    timer = Executors.newSingleThreadScheduledExecutor(r -> {
      Thread t = new Thread(r, "queue-janitor");
      t.setDaemon(true);
      return t;
    });
    timer.scheduleAtFixedRate(() -> {
      try {
        Map<String, Object> r = sweep(Instant.now());
        long noShow = (long) r.get("noShow");
        long left = (long) r.get("left");
        if (noShow > 0 || left > 0) log.info("Không đến: {}, bỏ về: {}", noShow, left);
      } catch (RuntimeException e) {
        log.error("Dọn hàng đợi lỗi: {}", e.toString());
      }
    }, 0, seconds, TimeUnit.SECONDS);
  }

  @PreDestroy
  public void stop() {
    if (timer != null) timer.shutdownNow();
  }

  public Map<String, Object> sweep(Instant now) {
    return tx.execute(s -> doSweep(now));
  }

  private Map<String, Object> doSweep(Instant now) {
    Instant late = now.minusSeconds(rules.checkinLateMinutes() * 60L);
    // Bỏ hẹn chỉ tính với lịch đã duyệt; lịch chưa ai duyệt mà quá giờ thì tự từ chối, không tính lỗi cho bệnh nhân
    long noShow = appointments.markNoShows(AppointmentsService.CONFIRMED, late);
    long expired = appointments.expirePending(late, now, "Phòng khám chưa xác nhận lịch trước giờ khám");

    LocalDate today = VnTime.today(now);
    boolean afterHours = VnTime.hour(now) >= rules.dayEndHour();
    List<Visit> stale = visits.staleWaiting(afterHours ? today.plusDays(1) : today);
    if (!stale.isEmpty()) {
      List<String> ids = stale.stream().map(Visit::getId).toList();
      List<String> appointmentIds = stale.stream().map(Visit::getAppointmentId).filter(Objects::nonNull).toList();
      visits.moveStatusAll(ids, List.of(VisitStatus.WAITING), VisitStatus.LEFT);
      if (!appointmentIds.isEmpty()) appointments.moveStatusAll(appointmentIds, QueueService.ACTIVE, AppointmentStatus.NO_SHOW);
    }
    if (noShow > 0 || expired > 0 || !stale.isEmpty()) realtime.staffChanged();
    return Json.obj("noShow", noShow, "left", (long) stale.size());
  }
}
