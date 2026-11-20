package com.clinic.repository;

import com.clinic.entity.MedicalRecordRevision;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MedicalRecordRevisionRepository extends JpaRepository<MedicalRecordRevision, String> {
  List<MedicalRecordRevision> findByVisitIdOrderByVersionAsc(String visitId);

  Optional<MedicalRecordRevision> findFirstByRecordIdOrderByVersionDesc(String recordId);

  /** [visitId, số lần lưu, có sửa sau khi hoàn tất] cho danh sách bệnh án */
  @Query("select r.visitId, count(r), max(case when r.afterDone = true then 1 else 0 end) from MedicalRecordRevision r "
      + "where r.visitId in :ids group by r.visitId")
  List<Object[]> summaryOf(@Param("ids") Collection<String> visitIds);
}
