package com.clinic.repository;

import com.clinic.entity.PushToken;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PushTokenRepository extends JpaRepository<PushToken, String> {}
