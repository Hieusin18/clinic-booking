package com.clinic.repository;

import com.clinic.entity.DoctorAvatar;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DoctorAvatarRepository extends JpaRepository<DoctorAvatar, String> {
  /** Thời điểm cập nhật ảnh (không đọc dữ liệu ảnh); null = chưa có ảnh. */
  @Query("select a.updatedAt from DoctorAvatar a where a.doctorId = :doctorId")
  Instant updatedAt(@Param("doctorId") String doctorId);
}
