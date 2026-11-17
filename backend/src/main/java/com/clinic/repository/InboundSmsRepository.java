package com.clinic.repository;

import com.clinic.entity.InboundSms;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InboundSmsRepository extends JpaRepository<InboundSms, String> {}
