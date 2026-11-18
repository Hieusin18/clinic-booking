package com.clinic.repository;

import com.clinic.entity.PhoneVerification;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PhoneVerificationRepository extends JpaRepository<PhoneVerification, String> {
  long countByPhoneAndCreatedAtGreaterThanEqual(String phone, Instant since);

  long countByIpAndCreatedAtGreaterThanEqual(String ip, Instant since);

  long countByCodeAndVerifiedAtIsNullAndExpiresAtAfter(String code, Instant now);

  List<PhoneVerification> findByCodeAndVerifiedAtIsNullAndExpiresAtAfter(String code, Instant now);

  /** Đánh dấu đã dùng (chỉ khi chưa dùng): trả về số dòng đổi. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update PhoneVerification v set v.usedAt = :now where v.id = :id and v.usedAt is null")
  int markUsed(@Param("id") String id, @Param("now") Instant now);
}
