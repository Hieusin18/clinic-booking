package com.clinic.repository;

import com.clinic.entity.LabOrder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LabOrderRepository extends JpaRepository<LabOrder, String> {}
