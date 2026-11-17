package com.clinic.repository;

import com.clinic.entity.Specialty;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecialtyRepository extends JpaRepository<Specialty, String> {
  Page<Specialty> findByNameContainingIgnoreCase(String name, Pageable page);

  List<Specialty> findByNameIgnoreCase(String name);
}
