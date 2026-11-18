package com.clinic.repository;

import com.clinic.entity.Prescription;
import com.clinic.entity.enums.PrescriptionStatus;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PrescriptionRepository extends JpaRepository<Prescription, String> {
  List<Prescription> findByVisitIdOrderByCreatedAtDesc(String visitId);

  List<Prescription> findByVisitIdAndStatus(String visitId, PrescriptionStatus status);

  /** Hoàn tất đơn nháp: trả số dòng đổi (0 = đơn đã hoàn tất từ trước). */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Prescription p set p.status = com.clinic.entity.enums.PrescriptionStatus.FINALIZED, p.finalizedAt = :now, p.code = :code "
      + "where p.id = :id and p.status = com.clinic.entity.enums.PrescriptionStatus.DRAFT")
  int finalizeDraft(@Param("id") String id, @Param("now") Instant now, @Param("code") String code);
}
