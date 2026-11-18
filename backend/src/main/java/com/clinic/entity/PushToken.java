package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Expo push token của từng máy đã đăng nhập (một tài khoản có thể dùng nhiều máy) */
@Entity
@Table(name = "PushToken")
@Getter
@Setter
public class PushToken {
  @Id
  private String token;

  private String userId;
  private String platform;
  private Instant createdAt;
  private Instant updatedAt;

  @PrePersist
  void prePersist() {
    Instant now = Instant.now();
    if (createdAt == null) createdAt = now;
    updatedAt = now;
  }

  @PreUpdate
  void preUpdate() {
    updatedAt = Instant.now();
  }
}
