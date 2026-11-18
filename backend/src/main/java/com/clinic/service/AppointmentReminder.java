package com.clinic.service;

import com.clinic.config.AppEnv;
import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.enums.NotificationType;
import com.clinic.repository.AppointmentRepository;
import com.clinic.util.QueueRules;
import com.clinic.util.VnTime;
import java.time.Instant;
import java.util.List;
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
 * Nhắc lịch hẹn (chạy mỗi REMINDER_SWEEP_SECONDS, mặc định 60 giây; 0 = tắt):
 * <ul>
 *   <li>trước một ngày: khi còn ≤ 24 giờ (và &gt; 2 giờ), chỉ với lịch đặt trước đó hơn 24 giờ;</li>
 *   <li>trước một giờ: khi còn ≤ 60 phút, chỉ với lịch đặt trước đó hơn 60 phút.</li>
 * </ul>
 * Mỗi lần nhắc được đánh dấu trên lịch hẹn trước khi gửi nên không gửi trùng.
 */
@Service
public class AppointmentReminder {
  private static final Logger log = LoggerFactory.getLogger(AppointmentReminder.class);
  private static final long MINUTE = 60;
  private static final long HOUR = 60 * MINUTE;
  /** Nhắc trước một ngày: chỉ gửi nếu còn hơn chừng này trước giờ hẹn (gửi trễ quá thì bỏ, đã có nhắc trước một giờ) */
  private static final long DAY_REMINDER_CUTOFF = 2 * HOUR;

  private final AppointmentRepository appointments;
  private final NotificationsService notifications;
  private final QueueRules rules;
  private final AppEnv env;
  private final TransactionTemplate tx;
  private ScheduledExecutorService timer;

  public AppointmentReminder(AppointmentRepository appointments, NotificationsService notifications, QueueRules rules, AppEnv env,
      PlatformTransactionManager txm) {
    this.appointments = appointments;
    this.notifications = notifications;
    this.rules = rules;
    this.env = env;
    this.tx = new TransactionTemplate(txm);
  }

  @EventListener(ApplicationReadyEvent.class)
  public void start() {
    if ("true".equals(System.getProperty(com.clinic.ClinicBookingApplication.CLI_PROPERTY))) return;
    int seconds = env.getInt("REMINDER_SWEEP_SECONDS", 60);
    if (seconds <= 0) return;
    timer = Executors.newSingleThreadScheduledExecutor(r -> {
      Thread t = new Thread(r, "reminder");
      t.setDaemon(true);
      return t;
    });
    timer.scheduleAtFixedRate(() -> {
      try {
        int n = sweep(Instant.now());
        if (n > 0) log.info("Đã gửi {} nhắc lịch", n);
      } catch (RuntimeException e) {
        log.error("Nhắc lịch lỗi: {}", e.toString());
      }
    }, 0, seconds, TimeUnit.SECONDS);
  }

  @jakarta.annotation.PreDestroy
  public void stop() {
    if (timer != null) timer.shutdownNow();
  }

  /** "ngày mai" / "hôm nay" / "ngày dd/MM" của giờ hẹn so với lúc gửi (theo giờ Việt Nam). */
  public static String dayWord(Instant start, Instant now) {
    String day = VnTime.dateString(start);
    if (day.equals(VnTime.dateString(now))) return "hôm nay";
    if (day.equals(VnTime.dateString(now.plusSeconds(24 * HOUR)))) return "ngày mai";
    String[] p = day.split("-");
    return "ngày " + p[2] + "/" + p[1];
  }

  /** Dữ liệu một lần nhắc (đọc trong transaction, gửi sau). */
  private record Due(String id, String userId, Instant start, Instant createdAt, Doctor doctor, String doctorName) {}

  public int sweep(Instant now) {
    int sent = 0;
    for (String kind : List.of("day", "hour")) {
      boolean day = kind.equals("day");
      long lead = day ? 24 * HOUR : HOUR;
      List<Due> due = tx.execute(s -> {
        List<Appointment> list = day
            ? appointments.dueForDayReminder(AppointmentsService.CONFIRMED, now.plusSeconds(lead), now.plusSeconds(DAY_REMINDER_CUTOFF))
            : appointments.dueForHourReminder(AppointmentsService.CONFIRMED, now.plusSeconds(lead), now);
        return list.stream().map(a -> new Due(a.getId(), a.getPatient().getUserId(), a.getSchedule().getStartTime(), a.getCreatedAt(),
            a.getSchedule().getDoctor(), a.getSchedule().getDoctor().getUser().getFullName())).toList();
      });
      for (Due a : due) {
        // Đặt sát giờ thì không nhắc mốc này
        if (a.start().toEpochMilli() - a.createdAt().toEpochMilli() < lead * 1000) continue;
        // Đánh dấu trước, chỉ gửi nếu chưa có tiến trình nào đánh dấu
        Integer claimed = tx.execute(s -> day ? appointments.claimDayReminder(a.id(), now) : appointments.claimHourReminder(a.id(), now));
        if (claimed == null || claimed == 0 || a.userId() == null) continue;
        Doctor d = a.doctor();
        String from = VnTime.time(a.start().minusSeconds(rules.checkinEarlyMinutes() * MINUTE));
        String to = VnTime.time(a.start().plusSeconds(rules.checkinLateMinutes() * MINUTE));
        long minutes = Math.max(1, Math.round((a.start().toEpochMilli() - now.toEpochMilli()) / 60_000.0));
        String title = day ? "Nhắc lịch khám " + dayWord(a.start(), now) + " lúc " + VnTime.time(a.start()) : "Còn " + minutes + " phút nữa tới giờ khám";
        String body = VnTime.time(a.start()) + " với bác sĩ " + a.doctorName() + (d.getRoom() != null && !d.getRoom().isEmpty() ? " (" + d.getRoom() + ")" : "")
            + ". Đến quầy quét mã QR để check-in từ " + from + " đến " + to + "; quá giờ lịch hẹn sẽ bị hủy.";
        notifications.notify(a.userId(), new NotificationsService.NewNotification(NotificationType.APPOINTMENT_REMINDER, title, body,
            "/appointments", null, a.id()));
        sent++;
      }
    }
    return sent;
  }
}
