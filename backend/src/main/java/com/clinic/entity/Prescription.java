package com.clinic.entity;

import com.clinic.entity.enums.PrescriptionStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Đơn thuốc. Khóa khi FINALIZED; cần sửa thì tạo đơn mới với replacesId trỏ về đơn cũ. */
@Entity
@Table(name = "Prescription")
@Getter
@Setter
public class Prescription extends BaseEntity {
  /** Mã đơn thuốc dạng xxxxxyyyyyyy-z (Thông tư 26/2025/TT-BYT), cấp khi hoàn tất đơn */
  private String code;
  private String visitId;
  private String doctorId;
  private String advice;

  @Enumerated(EnumType.STRING)
  private PrescriptionStatus status = PrescriptionStatus.DRAFT;

  private Instant finalizedAt;
  private String replacesId;
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
