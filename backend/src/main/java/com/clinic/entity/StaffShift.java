package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/** Ca trực của lễ tân do admin xếp (bác sĩ thì lịch làm việc là các khung giờ khám đã mở). */
@Entity
@Table(name = "StaffShift")
@Getter
@Setter
public class StaffShift extends BaseEntity {
  private String userId;
  private LocalDate date;
  private Instant startTime;
  private Instant endTime;
  private String note;
  private String createdById;
  private Instant createdAt;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "userId", insertable = false, updatable = false)
  private User user;

  @PrePersist
  void created() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
