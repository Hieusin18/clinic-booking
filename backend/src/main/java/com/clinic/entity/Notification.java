package com.clinic.entity;

import com.clinic.entity.enums.NotificationType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Hộp thư thông báo của bệnh nhân; đồng thời được đẩy về điện thoại nếu đã đăng ký token */
@Entity
@Table(name = "Notification")
@Getter
@Setter
public class Notification extends BaseEntity {
  private String userId;

  @Enumerated(EnumType.STRING)
  private NotificationType type;

  private String title;
  private String body;
  /** Màn hình trong app mở khi bấm, ví dụ "/visit/<id>" */
  private String url;
  private String visitId;
  private String appointmentId;
  private Instant readAt;
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
