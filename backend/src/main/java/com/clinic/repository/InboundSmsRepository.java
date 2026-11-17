package com.clinic.repository;

import com.clinic.entity.InboundSms;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface InboundSmsRepository extends JpaRepository<InboundSms, String> {
  @Query("select s from InboundSms s order by s.receivedAt desc")
  List<InboundSms> recent(Pageable page);
}
