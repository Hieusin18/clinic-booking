package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Đánh giá của bệnh nhân cho một lượt khám đã hoàn tất. */
@Entity
@Table(name = "Review")
@Getter
@Setter
public class Review extends BaseEntity {
  private String visitId;
  private String patientId;
  private String doctorId;
  private int rating;
  private String comment;
  private boolean hidden;
  private String hiddenReason;
  private String hiddenById;
  private Instant createdAt;
  private Instant updatedAt;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "patientId", insertable = false, updatable = false)
  private Patient patient;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "doctorId", insertable = false, updatable = false)
  private Doctor doctor;

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
