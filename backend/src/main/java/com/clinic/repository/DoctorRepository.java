package com.clinic.repository;

import com.clinic.entity.Doctor;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DoctorRepository extends JpaRepository<Doctor, String> {
  Optional<Doctor> findByUserId(String userId);
}
