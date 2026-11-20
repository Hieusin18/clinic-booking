package com.clinic.repository;

import com.clinic.entity.MedicalRecord;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MedicalRecordRepository extends JpaRepository<MedicalRecord, String> {
  Optional<MedicalRecord> findByVisitId(String visitId);

  java.util.List<MedicalRecord> findByVisitIdIn(java.util.Collection<String> visitIds);

  /** Bệnh án có hẹn tái khám trong khoảng ngày, lượt khám đã hoàn tất trước mốc {@code doneBefore}, chưa nhắc */
  @org.springframework.data.jpa.repository.Query("select r from MedicalRecord r, Visit v where v.id = r.visitId "
      + "and v.status = com.clinic.entity.enums.VisitStatus.DONE and v.completedAt < :doneBefore "
      + "and r.followUpDate >= :from and r.followUpDate <= :to and r.followUpRemindedAt is null")
  java.util.List<MedicalRecord> followUpsDue(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
      @org.springframework.data.repository.query.Param("to") java.time.LocalDate to,
      @org.springframework.data.repository.query.Param("doneBefore") java.time.Instant doneBefore);

  /** Đánh dấu đã nhắc; trả 0 nếu tiến trình khác đã đánh dấu trước */
  @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
  @org.springframework.data.jpa.repository.Query("update MedicalRecord r set r.followUpRemindedAt = :now where r.id = :id and r.followUpRemindedAt is null")
  int claimFollowUpReminder(@org.springframework.data.repository.query.Param("id") String id,
      @org.springframework.data.repository.query.Param("now") java.time.Instant now);
}
