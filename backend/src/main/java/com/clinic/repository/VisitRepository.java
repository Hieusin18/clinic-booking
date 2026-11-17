package com.clinic.repository;

import com.clinic.entity.Visit;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VisitRepository extends JpaRepository<Visit, String> {
  Optional<Visit> findByAppointmentId(String appointmentId);
}
