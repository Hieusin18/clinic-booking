package com.clinic.repository;

import com.clinic.entity.MedicalRecord;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MedicalRecordRepository extends JpaRepository<MedicalRecord, String> {
  Optional<MedicalRecord> findByVisitId(String visitId);
}
