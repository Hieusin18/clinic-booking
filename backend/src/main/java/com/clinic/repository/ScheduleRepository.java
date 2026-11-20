package com.clinic.repository;

import com.clinic.entity.Schedule;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduleRepository extends JpaRepository<Schedule, String> {
  /** Số khung giờ còn trống của bác sĩ trong một ngày, tính từ thời điểm {@code after}. */
  @Query("select count(s) from Schedule s where s.doctorId = :doctorId and s.date = :date and s.isBooked = false and s.startTime > :after")
  long countFree(@Param("doctorId") String doctorId, @Param("date") LocalDate date, @Param("after") Instant after);

  @Query("select s from Schedule s where s.doctorId = :doctorId and s.date = :date order by s.startTime asc")
  List<Schedule> findDay(@Param("doctorId") String doctorId, @Param("date") LocalDate date);

  @Query("select s from Schedule s where s.doctorId = :doctorId and s.date >= :from and s.date <= :to order by s.startTime asc")
  List<Schedule> findRange(@Param("doctorId") String doctorId, @Param("from") LocalDate from, @Param("to") LocalDate to);

  /** Đặt chỗ chống trùng: chỉ đánh dấu đã đặt khi khung giờ còn trống và chưa qua. Trả số dòng đổi (0 = vừa có người đặt). */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Schedule s set s.isBooked = true where s.id = :id and s.isBooked = false and s.startTime > :now")
  int book(@Param("id") String id, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Schedule s set s.isBooked = false where s.id = :id")
  int release(@Param("id") String id);

  /** Khung giờ của mọi bác sĩ trong khoảng ngày (admin xem lịch làm việc). */
  @Query("select s from Schedule s where s.date >= :from and s.date <= :to order by s.doctorId asc, s.startTime asc")
  List<Schedule> findAllRange(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
