package com.clinic.repository;

import com.clinic.entity.ClinicSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClinicSettingRepository extends JpaRepository<ClinicSetting, String> {}
