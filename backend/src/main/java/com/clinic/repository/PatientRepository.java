package com.clinic.repository;

import com.clinic.entity.Patient;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PatientRepository extends JpaRepository<Patient, String> {
  Optional<Patient> findByUserId(String userId);

  Optional<Patient> findByPhone(String phone);

  Optional<Patient> findByNationalId(String nationalId);

  /** Lễ tân tìm theo SĐT, CCCD hoặc tên (không phân biệt hoa thường). */
  @Query("select p from Patient p where p.phone like concat('%', :term, '%') "
      + "or p.nationalId like concat('%', :term, '%') or lower(p.fullName) like lower(concat('%', :term, '%'))")
  Page<Patient> search(@Param("term") String term, Pageable page);

  /** Chỉ ghi mã liên kết nếu hồ sơ vẫn chưa có (hai yêu cầu cùng lúc không tạo hai mã). */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Patient p set p.linkCode = :code where p.id = :id and p.linkCode is null")
  int setLinkCodeIfEmpty(@Param("id") String id, @Param("code") String code);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Patient p set p.historyLockedBefore = null, p.verifiedAt = :now, p.verifyFailures = 0, p.verifyLockedUntil = null where p.id = :id")
  int markVerified(@Param("id") String id, @Param("now") Instant now);
}
