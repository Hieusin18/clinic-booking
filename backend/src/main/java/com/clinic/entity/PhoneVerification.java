package com.clinic.entity;

import com.clinic.entity.enums.PhoneVerifyPurpose;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Xác minh số điện thoại kiểu "nhắn tin để xác thực": người dùng nhắn mã từ chính SIM của họ tới số của phòng khám */
@Entity
@Table(name = "PhoneVerification")
@Getter
@Setter
public class PhoneVerification extends BaseEntity {
  private String phone;

  @Enumerated(EnumType.STRING)
  private PhoneVerifyPurpose purpose;

  /** 6 chữ số, người dùng nhắn "PKXM <mã>" */
  private String code;
  /** SHA-256 của vé bí mật trả cho app (chỉ app tạo phiên mới hỏi trạng thái / dùng được phiên) */
  private String ticketHash;
  private String ip;
  private Instant expiresAt;
  private Instant verifiedAt;
  private Instant usedAt;
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
