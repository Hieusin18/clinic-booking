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

  /** Lịch sắp tới của bệnh nhân (còn hiệu lực, giờ hẹn sau cutoff); lockedBefore null = thấy hết. */
  @Query("select a from Appointment a join a.schedule s where a.patientId = :pid and (:locked is null or a.createdAt >= :locked) "
      + "and a.status in :active and s.startTime > :cutoff order by s.startTime asc")
  List<Appointment> upcoming(@Param("pid") String patientId, @Param("locked") Instant lockedBefore,
      @Param("active") Collection<AppointmentStatus> active, @Param("cutoff") Instant cutoff);

  /** Lịch đã qua hoặc đã hủy / xử lý của bệnh nhân. */
  @Query("select a from Appointment a join a.schedule s where a.patientId = :pid and (:locked is null or a.createdAt >= :locked) "
      + "and (a.status not in :active or s.startTime <= :cutoff) order by s.startTime desc")
  List<Appointment> past(@Param("pid") String patientId, @Param("locked") Instant lockedBefore,
      @Param("active") Collection<AppointmentStatus> active, @Param("cutoff") Instant cutoff);

  @Query("select a from Appointment a join a.schedule s where a.status in :statuses and s.date = :date order by s.startTime asc")
  List<Appointment> byDay(@Param("statuses") Collection<AppointmentStatus> statuses, @Param("date") LocalDate date);

  @Query("select a from Appointment a where a.scheduleId in :ids and a.status in :statuses")
  List<Appointment> forSchedules(@Param("ids") Collection<String> scheduleIds, @Param("statuses") Collection<AppointmentStatus> statuses);

  long countByScheduleId(String scheduleId);

  /** Đổi trạng thái nếu đang ở một trong các trạng thái cho trước; trả số dòng đổi. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Appointment a set a.status = :to where a.id = :id and a.status in :from")
  int moveStatus(@Param("id") String id, @Param("from") Collection<AppointmentStatus> from, @Param("to") AppointmentStatus to);
}
