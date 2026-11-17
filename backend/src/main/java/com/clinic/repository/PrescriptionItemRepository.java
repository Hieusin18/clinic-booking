package com.clinic.repository;

import com.clinic.entity.PrescriptionItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PrescriptionItemRepository extends JpaRepository<PrescriptionItem, String> {
  List<PrescriptionItem> findByPrescriptionId(String prescriptionId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from PrescriptionItem i where i.prescriptionId = :id")
  int deleteOf(@Param("id") String prescriptionId);
}
