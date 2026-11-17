package com.clinic.repository;

import com.clinic.entity.Visit;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VisitRepository extends JpaRepository<Visit, String> {
  Optional<Visit> findByAppointmentId(String appointmentId);

  long countByPatientIdAndCreatedAtBefore(String patientId, Instant before);

  /** Số đang chờ của bệnh nhân cho một chuyên khoa trong ngày. */
  @Query("select v from Visit v join v.doctor d where v.patientId = :pid and v.date = :date and v.status = com.clinic.entity.enums.VisitStatus.WAITING "
      + "and d.specialtyId = :sid")
  List<Visit> waitingForSpecialty(@Param("pid") String patientId, @Param("date") LocalDate date, @Param("sid") String specialtyId);

  @Query("select coalesce(max(v.queueNumber), 0) from Visit v where v.doctorId = :doctorId and v.date = :date and v.source = :source")
  int maxNumber(@Param("doctorId") String doctorId, @Param("date") LocalDate date, @Param("source") VisitSource source);

  /** Hàng đợi trong ngày (doctorId rỗng = cả phòng khám), theo bác sĩ rồi thứ tự đến. */
  @Query("select v from Visit v where v.date = :date and (:doctorId = '' or v.doctorId = :doctorId) order by v.doctorId asc, v.createdAt asc")
  List<Visit> ofDay(@Param("date") LocalDate date, @Param("doctorId") String doctorId);

  @Query("select v from Visit v where v.doctorId = :doctorId and v.date = :date and v.status in :statuses")
  List<Visit> withStatus(@Param("doctorId") String doctorId, @Param("date") LocalDate date, @Param("statuses") Collection<VisitStatus> statuses);

  /** Các lượt đã gọi gần nhất (mới nhất trước), trừ các trạng thái cho trước. */
  @Query("select v from Visit v where v.doctorId = :doctorId and v.date = :date and v.calledAt is not null and v.status not in :exclude "
      + "order by v.calledAt desc")
  List<Visit> recentlyCalled(@Param("doctorId") String doctorId, @Param("date") LocalDate date, @Param("exclude") Collection<VisitStatus> exclude,
      Pageable page);

  @Query("select v from Visit v where v.doctorId = :doctorId and v.date = :date and v.calledAt is not null order by v.calledAt desc")
  List<Visit> called(@Param("doctorId") String doctorId, @Param("date") LocalDate date, Pageable page);

  /** Phiếu khám hôm nay của bệnh nhân (lockedBefore khác null thì chỉ lấy phiếu tạo từ mốc đó). */
  @Query("select v from Visit v where v.patientId = :pid and v.date = :date and (:locked is null or v.createdAt >= :locked) order by v.createdAt desc")
  List<Visit> ofPatientOnDay(@Param("pid") String patientId, @Param("date") LocalDate date, @Param("locked") Instant lockedBefore);

  /** Số còn đang chờ của các ngày trước {@code before}. */
  @Query("select v from Visit v where v.status = com.clinic.entity.enums.VisitStatus.WAITING and v.date < :before")
  List<Visit> staleWaiting(@Param("before") LocalDate before);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Visit v set v.status = :to where v.id in :ids and v.status in :from")
  int moveStatusAll(@Param("ids") Collection<String> ids, @Param("from") Collection<VisitStatus> from, @Param("to") VisitStatus to);

  /** Đổi trạng thái nếu đang ở một trong các trạng thái cho trước; trả số dòng đổi. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Visit v set v.status = :to where v.id = :id and v.status in :from")
  int moveStatus(@Param("id") String id, @Param("from") Collection<VisitStatus> from, @Param("to") VisitStatus to);
}
