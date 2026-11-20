package com.clinic.service;

import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Schedule;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.NotificationType;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.repository.Refresher;
import com.clinic.repository.ScheduleRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.VnTime;
import com.clinic.view.AppointmentViews;
import com.clinic.view.Json;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Hẹn tái khám: bác sĩ ghi ngày tái khám trong bệnh án rồi đặt luôn một khung giờ cho bệnh nhân (lịch đã xác nhận),
 * hoặc để hệ thống nhắc bệnh nhân tự đặt lịch khi gần đến hạn.
 */
@Service
public class FollowUpService {
  /** Nhắc đặt lịch tái khám khi còn chừng này ngày */
  public static final int REMIND_DAYS_BEFORE = 3;
  /** Đã có lịch trong khoảng ± chừng này ngày quanh ngày hẹn thì coi như đã đặt tái khám */
  static final int BOOKED_WINDOW_DAYS = 7;
  static final List<AppointmentStatus> ACTIVE = AppointmentsService.ACTIVE;
  static final List<AppointmentStatus> BOOKED = List.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED);

  private final VisitRepository visits;
  private final DoctorRepository doctors;
  private final MedicalRecordRepository records;
  private final ScheduleRepository schedules;
  private final AppointmentRepository appointments;
  private final NotificationsService notifications;
  private final RealtimeService realtime;
  private final Refresher refresher;
  private final TransactionTemplate tx;

  public FollowUpService(VisitRepository visits, DoctorRepository doctors, MedicalRecordRepository records, ScheduleRepository schedules,
      AppointmentRepository appointments, NotificationsService notifications, RealtimeService realtime, Refresher refresher,
      org.springframework.transaction.PlatformTransactionManager txm) {
    this.visits = visits;
    this.doctors = doctors;
    this.records = records;
    this.schedules = schedules;
    this.appointments = appointments;
    this.notifications = notifications;
    this.realtime = realtime;
    this.refresher = refresher;
    this.tx = new TransactionTemplate(txm);
  }

  /** Lượt khám của bác sĩ đang đăng nhập. */
  private Visit ownVisit(AuthUser user, String visitId) {
    String doctorId = doctors.findByUserId(user.sub()).map(Doctor::getId).orElseThrow(() -> ApiException.forbidden("Tài khoản không gắn với bác sĩ nào"));
    return visits.findById(visitId).filter(v -> v.getDoctorId().equals(doctorId)).orElseThrow(() -> ApiException.notFound("Không tìm thấy phiếu khám"));
  }

  /** Lịch tái khám bác sĩ đã đặt cho lượt khám (còn hiệu lực), dạng trả về; null = chưa đặt. */
  @Transactional(readOnly = true)
  public Map<String, Object> appointmentOf(String visitId) {
    return appointments.findFirstByFollowUpOfVisitIdAndStatusIn(visitId, ACTIVE).map(AppointmentViews::view).orElse(null);
  }

  private static String when(Instant start) {
    return VnTime.time(start) + " ngày " + VnTime.dmy(VnTime.date(start));
  }

  /**
   * Bác sĩ đặt lịch tái khám cho bệnh nhân vào một khung giờ còn trống của chính mình. Lịch có hiệu lực ngay (không
   * chờ lễ tân duyệt, không tính vào giới hạn lịch chờ duyệt); ngày tái khám trong bệnh án theo ngày của khung giờ.
   */
  @Transactional
  public Map<String, Object> book(AuthUser user, String visitId, String scheduleId) {
    Visit visit = ownVisit(user, visitId);
    if (visit.getStatus() != VisitStatus.IN_PROGRESS && visit.getStatus() != VisitStatus.AWAITING_RESULTS && visit.getStatus() != VisitStatus.DONE) {
      throw ApiException.conflict("Chỉ hẹn tái khám cho bệnh nhân đang khám hoặc đã khám");
    }
    MedicalRecord record = records.findByVisitId(visitId).orElseThrow(() -> ApiException.conflict("Cần lưu bệnh án trước khi đặt lịch tái khám"));
    if (appointments.findFirstByFollowUpOfVisitIdAndStatusIn(visitId, ACTIVE).isPresent()) {
      throw ApiException.conflict("Đã đặt lịch tái khám cho lượt khám này; hủy lịch cũ trước khi đặt lại");
    }
    Schedule slot = schedules.findById(scheduleId).filter(s -> s.getDoctorId().equals(visit.getDoctorId()))
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy khung giờ"));
    if (!slot.getDate().isAfter(visit.getDate())) throw ApiException.badRequest("Ngày tái khám phải sau ngày khám");
    if (schedules.book(slot.getId(), Instant.now()) == 0) throw ApiException.conflict("Khung giờ này vừa có người đặt, vui lòng chọn giờ khác");
    Appointment a = new Appointment();
    a.setPatientId(visit.getPatientId());
    a.setScheduleId(slot.getId());
    a.setReason("Tái khám");
    a.setStatus(AppointmentStatus.CONFIRMED);
    a.setReviewedAt(Instant.now());
    a.setReviewedById(user.sub());
    a.setFollowUpOfVisitId(visitId);
    appointments.saveAndFlush(a);
    record.setFollowUpDate(slot.getDate());
    record.setFollowUpRemindedAt(null);
    records.saveAndFlush(record);
    realtime.staffChanged();
    String userId = visit.getPatient().getUserId();
    Doctor d = visit.getDoctor();
    notifications.notifyLater(userId, new NotificationsService.NewNotification(NotificationType.FOLLOW_UP, "Bác sĩ đã đặt lịch tái khám cho bạn",
        when(slot.getStartTime()) + " với " + NotificationsService.doctorLabel(d) + ". Lịch đã được xác nhận, đến quầy quét mã QR để check-in.",
        "/appointments", visitId, a.getId()));
    return AppointmentViews.view(refresher.refresh(a));
  }

  /** Bác sĩ hủy lịch tái khám đã đặt (vd. chọn nhầm giờ): khung giờ được mở lại. */
  @Transactional
  public void cancel(AuthUser user, String visitId) {
    ownVisit(user, visitId);
    Appointment a = appointments.findFirstByFollowUpOfVisitIdAndStatusIn(visitId, ACTIVE)
        .orElseThrow(() -> ApiException.notFound("Lượt khám này chưa có lịch tái khám"));
    if (!a.getSchedule().getStartTime().isAfter(Instant.now())) throw ApiException.conflict("Lịch tái khám đã đến giờ, không hủy được");
    a.setStatus(AppointmentStatus.CANCELLED);
    appointments.saveAndFlush(a);
    schedules.release(a.getScheduleId());
    realtime.staffChanged();
    notifications.notifyLater(a.getPatient().getUserId(), new NotificationsService.NewNotification(NotificationType.FOLLOW_UP,
        "Lịch tái khám đã được hủy", "Lịch " + when(a.getSchedule().getStartTime()) + " đã được bác sĩ hủy. Bạn có thể tự đặt giờ khác trong app.",
        "/appointments", visitId, a.getId()));
  }

  /** Khám xong mà có hẹn tái khám nhưng bác sĩ chưa đặt giờ: báo bệnh nhân ngày hẹn để tự đặt lịch. */
  public void visitCompleted(Visit visit) {
    MedicalRecord r = records.findByVisitId(visit.getId()).orElse(null);
    if (r == null || r.getFollowUpDate() == null) return;
    if (appointments.findFirstByFollowUpOfVisitIdAndStatusIn(visit.getId(), ACTIVE).isPresent()) return;
    notifications.notifyLater(visit.getPatient().getUserId(), new NotificationsService.NewNotification(NotificationType.FOLLOW_UP,
        "Bác sĩ hẹn tái khám ngày " + VnTime.dmy(r.getFollowUpDate()),
        NotificationsService.doctorLabel(visit.getDoctor()) + " hẹn bạn tái khám ngày " + VnTime.dmy(r.getFollowUpDate())
            + ". Bấm để đặt lịch; app sẽ nhắc lại trước " + REMIND_DAYS_BEFORE + " ngày nếu bạn chưa đặt.",
        "/book/" + visit.getDoctorId(), visit.getId(), null));
  }

  /**
   * Nhắc đặt lịch tái khám: hẹn trong {@link #REMIND_DAYS_BEFORE} ngày tới (hoặc đã quá hạn tối đa 3 ngày) mà bệnh nhân
   * chưa có lịch nào quanh ngày hẹn. Mỗi bệnh án nhắc một lần; chỉ nhắc từ 7h đến 20h.
   */
  public int sweep(Instant now) {
    int hour = VnTime.hour(now);
    if (hour < 7 || hour >= 20) return 0;
    LocalDate today = VnTime.today(now);
    record Due(String recordId, String visitId, String userId, String patientId, LocalDate date, Instant visitAt, String doctorId, String doctorLabel) {}
    List<Due> due = tx.execute(s -> records.followUpsDue(today.minusDays(3), today.plusDays(REMIND_DAYS_BEFORE), now.minus(Duration.ofHours(12))).stream()
        .map(r -> {
          Visit v = visits.findById(r.getVisitId()).orElseThrow();
          return new Due(r.getId(), v.getId(), v.getPatient().getUserId(), v.getPatientId(), r.getFollowUpDate(), v.getCreatedAt(), v.getDoctorId(),
              NotificationsService.doctorLabel(v.getDoctor()));
        }).toList());
    int sent = 0;
    for (Due d : due) {
      Boolean booked = tx.execute(s -> appointments.hasBookingBetween(d.patientId(), BOOKED, d.date().minusDays(BOOKED_WINDOW_DAYS),
          d.date().plusDays(BOOKED_WINDOW_DAYS), d.visitAt()));
      Integer claimed = tx.execute(s -> records.claimFollowUpReminder(d.recordId(), now));
      if (claimed == null || claimed == 0 || Boolean.TRUE.equals(booked) || d.userId() == null) continue;
      long days = d.date().toEpochDay() - today.toEpochDay();
      String when = days == 0 ? "hôm nay" : days == 1 ? "ngày mai" : days > 0 ? "ngày " + VnTime.dmy(d.date()) : "từ ngày " + VnTime.dmy(d.date());
      notifications.notify(d.userId(), new NotificationsService.NewNotification(NotificationType.FOLLOW_UP,
          days >= 0 ? "Sắp đến hẹn tái khám " + when : "Bạn đã quá hẹn tái khám",
          d.doctorLabel() + " hẹn bạn tái khám " + when + " nhưng bạn chưa đặt lịch. Bấm để chọn giờ khám.", "/book/" + d.doctorId(), d.visitId(),
          null));
      sent++;
    }
    return sent;
  }
}
