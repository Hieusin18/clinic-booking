package com.clinic.repository;

import com.clinic.entity.StaffShift;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StaffShiftRepository extends JpaRepository<StaffShift, String> {
  @Query("select s from StaffShift s where s.date >= :from and s.date <= :to order by s.startTime asc")
  List<StaffShift> findRange(@Param("from") LocalDate from, @Param("to") LocalDate to);

  @Query("select s from StaffShift s where s.userId = :userId and s.date >= :from and s.date <= :to order by s.startTime asc")
  List<StaffShift> findRange(@Param("userId") String userId, @Param("from") LocalDate from, @Param("to") LocalDate to);

  /** Ca của cùng người chồng lên khoảng [start, end) */
  @Query("select count(s) > 0 from StaffShift s where s.userId = :userId and s.startTime < :end and s.endTime > :start")
  boolean overlaps(@Param("userId") String userId, @Param("start") Instant start, @Param("end") Instant end);
}
