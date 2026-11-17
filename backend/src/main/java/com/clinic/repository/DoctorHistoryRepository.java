package com.clinic.repository;

import com.clinic.entity.DoctorHistory;
import com.clinic.entity.enums.DoctorHistoryKind;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DoctorHistoryRepository extends JpaRepository<DoctorHistory, String> {
  List<DoctorHistory> findByDoctorId(String doctorId);

  /** Việc đang làm (mốc công tác "đến nay") gần nhất. */
  Optional<DoctorHistory> findFirstByDoctorIdAndKindAndToYearIsNullOrderByFromYearDesc(String doctorId, DoctorHistoryKind kind);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from DoctorHistory h where h.doctorId = :doctorId and h.kind = :kind")
  int deleteKind(@Param("doctorId") String doctorId, @Param("kind") DoctorHistoryKind kind);
}
