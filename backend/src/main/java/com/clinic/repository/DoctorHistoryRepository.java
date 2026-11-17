package com.clinic.repository;

import com.clinic.entity.DoctorHistory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DoctorHistoryRepository extends JpaRepository<DoctorHistory, String> {}
