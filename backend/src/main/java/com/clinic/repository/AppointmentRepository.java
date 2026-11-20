package com.clinic.repository;

import com.clinic.entity.Appointment;
import com.clinic.entity.enums.AppointmentStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppointmentRepository extends JpaRepository<Appointment, String> {
  /** Ngày khám của các lịch hẹn bị tính "không đến" từ ngày {@code since}. */
  @Query("select s.date from Appointment a join a.schedule s where a.patientId = :pid and a.status = com.clinic.entity.enums.AppointmentStatus.NO_SHOW and s.date >= :since")
  List<LocalDate> noShowDates(@Param("pid") String patientId, @Param("since") LocalDate since);

  /** Bệnh nhân đã có lịch còn hiệu lực với bác sĩ này trong ngày chưa. */
  @Query("select count(a) > 0 from Appointment a join a.schedule s where a.patientId = :pid and a.status in :statuses "
      + "and s.doctorId = :doctorId and s.date = :date")
  boolean existsSameDay(@Param("pid") String patientId, @Param("statuses") Collection<AppointmentStatus> statuses,
      @Param("doctorId") String doctorId, @Param("date") LocalDate date);

  /** Lịch sắp tới của bệnh nhân (còn hiệu lực, giờ hẹn sau cutoff), tạo từ mốc lockedBefore (Instant.EPOCH = thấy hết). */
  @Query("select a from Appointment a join a.schedule s where a.patientId = :pid and a.createdAt >= :locked "
      + "and a.status in :active and s.startTime > :cutoff order by s.startTime asc")
  List<Appointment> upcoming(@Param("pid") String patientId, @Param("locked") Instant lockedBefore,
      @Param("active") Collection<AppointmentStatus> active, @Param("cutoff") Instant cutoff);

  /** Lịch đã qua hoặc đã hủy / xử lý của bệnh nhân. */
  @Query("select a from Appointment a join a.schedule s where a.patientId = :pid and a.createdAt >= :locked "
      + "and (a.status not in :active or s.startTime <= :cutoff) order by s.startTime desc")
  List<Appointment> past(@Param("pid") String patientId, @Param("locked") Instant lockedBefore,
      @Param("active") Collection<AppointmentStatus> active, @Param("cutoff") Instant cutoff);

  @Query("select a from Appointment a join a.schedule s where a.status in :statuses and s.date = :date order by s.startTime asc")
  List<Appointment> byDay(@Param("statuses") Collection<AppointmentStatus> statuses, @Param("date") LocalDate date);

  @Query("select a from Appointment a where a.scheduleId in :ids and a.status in :statuses")
  List<Appointment> forSchedules(@Param("ids") Collection<String> scheduleIds, @Param("statuses") Collection<AppointmentStatus> statuses);

  long countByScheduleId(String scheduleId);

  /** Số lịch hẹn theo trạng thái trong khoảng ngày khám: [trạng thái, số lượng]. */
  @Query("select a.status, count(a) from Appointment a join a.schedule s where s.date >= :from and s.date <= :to group by a.status")
  List<Object[]> countByStatus(@Param("from") LocalDate from, @Param("to") LocalDate to);

  /** Lịch hẹn đã tới giờ (tính đến now) và không bị hủy, trong khoảng ngày khám. */
  @Query("select count(a) from Appointment a join a.schedule s where s.date >= :from and s.date <= :to and s.startTime <= :now "
      + "and a.status <> com.clinic.entity.enums.AppointmentStatus.CANCELLED")
  long countPastNotCancelled(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("now") Instant now);

  /** Lịch hẹn hôm nay của bệnh nhân còn hiệu lực và chưa check-in, theo giờ hẹn. */
  @Query("select a from Appointment a join a.schedule s where a.patientId = :pid and a.status in :active and s.date = :date "
      + "and not exists (select 1 from Visit v where v.appointmentId = a.id) order by s.startTime asc")
  List<Appointment> openToday(@Param("pid") String patientId, @Param("active") Collection<AppointmentStatus> active, @Param("date") LocalDate date);

  /** Lịch hẹn quá giờ hẹn + khung trễ mà chưa check-in → "không đến". */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.status = com.clinic.entity.enums.AppointmentStatus.NO_SHOW where a.status in :active "
      + "and not exists (select 1 from Visit v where v.appointmentId = a.id) "
      + "and a.scheduleId in (select s.id from Schedule s where s.startTime < :before)")
  int markNoShows(@Param("active") Collection<AppointmentStatus> active, @Param("before") Instant before);

  /** Lịch đặt online đang chờ lễ tân duyệt, chưa quá giờ khám; giờ khám sớm nhất trước. */
  @Query("select a from Appointment a join a.schedule s where a.status = com.clinic.entity.enums.AppointmentStatus.PENDING "
      + "and s.startTime > :after order by s.startTime asc")
  List<Appointment> pendingReview(@Param("after") Instant after);

  /** Số lịch chờ duyệt (số trên menu của lễ tân). */
  @Query("select count(a) from Appointment a join a.schedule s where a.status = com.clinic.entity.enums.AppointmentStatus.PENDING "
      + "and s.startTime > :after")
  long countPendingReview(@Param("after") Instant after);

  /** Số lịch của một bệnh nhân đang chờ lễ tân duyệt (giờ hẹn chưa qua) */
  @Query("select count(a) from Appointment a join a.schedule s where a.patientId = :pid "
      + "and a.status = com.clinic.entity.enums.AppointmentStatus.PENDING and s.startTime > :after")
  long countPendingOf(@Param("pid") String patientId, @Param("after") Instant after);

  /** Số lịch của bệnh nhân theo trạng thái (lễ tân xem trước khi duyệt: đã đến bao nhiêu lần, bỏ bao nhiêu lần). */
  @Query("select a.status, count(a) from Appointment a where a.patientId = :pid group by a.status")
  List<Object[]> countByStatusOf(@Param("pid") String patientId);

  /** Lịch chờ duyệt đã quá giờ khám + khung trễ mà chưa ai duyệt: tự từ chối (không tính là bệnh nhân không đến). */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.status = com.clinic.entity.enums.AppointmentStatus.REJECTED, a.rejectReason = :reason, a.reviewedAt = :now "
      + "where a.status = com.clinic.entity.enums.AppointmentStatus.PENDING "
      + "and not exists (select 1 from Visit v where v.appointmentId = a.id) "
      + "and a.scheduleId in (select s.id from Schedule s where s.startTime < :before)")
  int expirePending(@Param("before") Instant before, @Param("now") Instant now, @Param("reason") String reason);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.status = :to where a.id in :ids and a.status in :from")
  int moveStatusAll(@Param("ids") Collection<String> ids, @Param("from") Collection<AppointmentStatus> from, @Param("to") AppointmentStatus to);

  /** Lịch cần nhắc trước một ngày: còn hiệu lực, chưa check-in, chưa nhắc, giờ hẹn trong (after, until]. */
  @Query("select a from Appointment a join a.schedule s where a.status in :active and a.remindedDayAt is null "
      + "and not exists (select 1 from Visit v where v.appointmentId = a.id) and s.startTime <= :until and s.startTime > :after")
  List<Appointment> dueForDayReminder(@Param("active") Collection<AppointmentStatus> active, @Param("until") Instant until, @Param("after") Instant after);

  @Query("select a from Appointment a join a.schedule s where a.status in :active and a.remindedHourAt is null "
      + "and not exists (select 1 from Visit v where v.appointmentId = a.id) and s.startTime <= :until and s.startTime > :after")
  List<Appointment> dueForHourReminder(@Param("active") Collection<AppointmentStatus> active, @Param("until") Instant until, @Param("after") Instant after);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.remindedDayAt = :now where a.id = :id and a.remindedDayAt is null")
  int claimDayReminder(@Param("id") String id, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.remindedHourAt = :now where a.id = :id and a.remindedHourAt is null")
  int claimHourReminder(@Param("id") String id, @Param("now") Instant now);

  /** Đổi trạng thái nếu đang ở một trong các trạng thái cho trước; trả số dòng đổi. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.status = :to where a.id = :id and a.status in :from")
  int moveStatus(@Param("id") String id, @Param("from") Collection<AppointmentStatus> from, @Param("to") AppointmentStatus to);

  /** Lịch tái khám bác sĩ đã đặt cho lượt khám (còn hiệu lực) */
  java.util.Optional<Appointment> findFirstByFollowUpOfVisitIdAndStatusIn(String visitId, Collection<AppointmentStatus> statuses);

  /** Bệnh nhân đã có lịch (còn hiệu lực hoặc đã khám) trong khoảng ngày, đặt sau mốc {@code after}: khỏi nhắc tái khám */
  @Query("select count(a) > 0 from Appointment a join a.schedule s where a.patientId = :pid and a.status in :statuses "
      + "and s.date >= :from and s.date <= :to and a.createdAt >= :after")
  boolean hasBookingBetween(@Param("pid") String patientId, @Param("statuses") Collection<AppointmentStatus> statuses,
      @Param("from") LocalDate from, @Param("to") LocalDate to, @Param("after") Instant after);
}
