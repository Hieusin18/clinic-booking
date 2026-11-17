package com.clinic.repository;

import com.clinic.entity.LabOrder;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LabOrderRepository extends JpaRepository<LabOrder, String> {
  long countByVisitId(String visitId);

  long countByVisitIdAndDoneAtIsNull(String visitId);

  List<LabOrder> findByVisitIdOrderByCreatedAtAsc(String visitId);

  List<LabOrder> findByVisitIdAndDoneAtIsNullOrderByCreatedAtAsc(String visitId);
}
