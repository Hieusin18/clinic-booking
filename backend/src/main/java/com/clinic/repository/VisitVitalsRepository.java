package com.clinic.repository;

import com.clinic.entity.VisitVitals;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VisitVitalsRepository extends JpaRepository<VisitVitals, String> {
  Optional<VisitVitals> findByVisitId(String visitId);

  List<VisitVitals> findByVisitIdIn(Collection<String> visitIds);
}
