package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Tin nhắn cổng SMS chuyển tới (iPhone Phím tắt, Android SMS Gateway, hoặc giả lập), để admin theo dõi */
@Entity
@Table(name = "InboundSms")
@Getter
@Setter
public class InboundSms extends BaseEntity {
  private String source;
  private String fromRaw;
  /** Số đã chuẩn hóa 0xxxxxxxxx (null nếu người gửi không phải số điện thoại, vd. email iMessage) */
  private String phone;
  private String body;
  /** VERIFIED / WRONG_SENDER / NO_MATCH / INVALID_SENDER */
  private String result;
  private String verificationId;
  private Instant receivedAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (receivedAt == null) receivedAt = Instant.now();
  }
}
