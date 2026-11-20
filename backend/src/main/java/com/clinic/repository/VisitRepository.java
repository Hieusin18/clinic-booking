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

  /** Phiếu khám hôm nay của bệnh nhân, tạo từ mốc lockedBefore (Instant.EPOCH = thấy hết). */
  @Query("select v from Visit v where v.patientId = :pid and v.date = :date and v.createdAt >= :locked order by v.createdAt desc")
  List<Visit> ofPatientOnDay(@Param("pid") String patientId, @Param("date") LocalDate date, @Param("locked") Instant lockedBefore);

  /** Lịch sử khám của bệnh nhân (đã khám xong hoặc đang chờ kết quả), tạo từ mốc {@code from}, mới nhất trước. */
  @Query("select v from Visit v where v.patientId = :pid and v.status in :statuses and v.createdAt >= :from order by v.date desc, v.createdAt desc")
  List<Visit> history(@Param("pid") String patientId, @Param("statuses") Collection<VisitStatus> statuses, @Param("from") Instant from);

  /**
   * Bệnh án các lượt bác sĩ đã khám xong trong khoảng ngày, tìm theo tên hoặc SĐT bệnh nhân, chẩn đoán hoặc mã ICD
   * (text rỗng = không lọc), mới nhất trước.
   */
  @Query(value = "select v from Visit v join v.patient p where v.doctorId = :doctorId and v.status = com.clinic.entity.enums.VisitStatus.DONE "
      + "and v.date >= :from and v.date <= :to and (:text = '' or lower(p.fullName) like lower(concat('%', :text, '%')) "
      + "or p.phone like concat(:text, '%') or exists (select 1 from MedicalRecord r where r.visitId = v.id "
      + "and (lower(r.diagnosis) like lower(concat('%', :text, '%')) or r.icdCode like concat(:upper, '%')))) "
      + "order by v.date desc, v.calledAt desc, v.createdAt desc",
      countQuery = "select count(v) from Visit v join v.patient p where v.doctorId = :doctorId and v.status = com.clinic.entity.enums.VisitStatus.DONE "
          + "and v.date >= :from and v.date <= :to and (:text = '' or lower(p.fullName) like lower(concat('%', :text, '%')) "
          + "or p.phone like concat(:text, '%') or exists (select 1 from MedicalRecord r where r.visitId = v.id "
          + "and (lower(r.diagnosis) like lower(concat('%', :text, '%')) or r.icdCode like concat(:upper, '%'))))")
  org.springframework.data.domain.Page<Visit> examined(@Param("doctorId") String doctorId, @Param("from") LocalDate from, @Param("to") LocalDate to,
      @Param("text") String text, @Param("upper") String upper, Pageable page);

  /** Lượt khám của bác sĩ đang chờ kết quả cận lâm sàng (mọi ngày), cũ nhất trước. */
  @Query("select v from Visit v where v.doctorId = :doctorId and v.status = com.clinic.entity.enums.VisitStatus.AWAITING_RESULTS order by v.sentForTestsAt asc")
  List<Visit> awaiting(@Param("doctorId") String doctorId);

  @Query("select v from Visit v where v.date >= :from and v.date <= :to")
  List<Visit> inRange(@Param("from") LocalDate from, @Param("to") LocalDate to);

  /** Ngày khám đầu tiên của từng bệnh nhân: [patientId, ngày]. */
  @Query("select v.patientId, min(v.date) from Visit v where v.patientId in :ids group by v.patientId")
  List<Object[]> firstVisitDates(@Param("ids") Collection<String> patientIds);

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

  /**
   * Admin: mọi lượt khám đã có bệnh án (mọi bác sĩ), lọc theo bác sĩ (rỗng = tất cả), khoảng ngày và từ khóa (tên/SĐT
   * bệnh nhân, chẩn đoán, mã ICD), mới nhất trước.
   */
  @Query(value = "select v from Visit v join v.patient p where (:doctorId = '' or v.doctorId = :doctorId) and v.date >= :from and v.date <= :to "
      + "and exists (select 1 from MedicalRecord r where r.visitId = v.id and (:text = '' or lower(p.fullName) like lower(concat('%', :text, '%')) "
      + "or p.phone like concat(:text, '%') or lower(r.diagnosis) like lower(concat('%', :text, '%')) or r.icdCode like concat(:upper, '%'))) "
      + "order by v.date desc, v.createdAt desc",
      countQuery = "select count(v) from Visit v join v.patient p where (:doctorId = '' or v.doctorId = :doctorId) and v.date >= :from and v.date <= :to "
          + "and exists (select 1 from MedicalRecord r where r.visitId = v.id and (:text = '' or lower(p.fullName) like lower(concat('%', :text, '%')) "
          + "or p.phone like concat(:text, '%') or lower(r.diagnosis) like lower(concat('%', :text, '%')) or r.icdCode like concat(:upper, '%')))")
  org.springframework.data.domain.Page<Visit> withRecords(@Param("doctorId") String doctorId, @Param("from") LocalDate from, @Param("to") LocalDate to,
      @Param("text") String text, @Param("upper") String upper, Pageable page);
}
