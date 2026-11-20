package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Banner trên app bệnh nhân: NOTICE (dải thông báo chữ) hoặc PROMO (ảnh giới thiệu), có hạn hiển thị. */
@Entity
@Table(name = "Banner")
@Getter
@Setter
public class Banner extends BaseEntity {
  private String kind;
  private String title;
  private String body;
  private String link;
  private Instant startsAt;
  private Instant endsAt;
  private int sortOrder;
  private boolean active = true;
  private Instant createdAt;
  private Instant updatedAt;

  @PrePersist
  void prePersist() {
    assignId();
    Instant now = Instant.now();
    if (createdAt == null) createdAt = now;
    updatedAt = now;
  }

  @PreUpdate
  void preUpdate() {
    updatedAt = Instant.now();
  }
}
