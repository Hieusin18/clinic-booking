package com.clinic.entity;

import com.clinic.entity.enums.AppointmentStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "Appointment")
@Getter
@Setter
public class Appointment extends BaseEntity {
  private String patientId;
  private String scheduleId;

  @Enumerated(EnumType.STRING)
  private AppointmentStatus status = AppointmentStatus.PENDING;

  private String reason;
  private Instant createdAt;

  /** Đã gửi nhắc lịch trước một ngày / trước một giờ (tránh gửi trùng) */
  private Instant remindedDayAt;
  private Instant remindedHourAt;

  /** Lễ tân duyệt / từ chối lịch đặt online: lúc nào, ai, lý do từ chối */
  private Instant reviewedAt;
  private String reviewedById;
  private String rejectReason;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "patientId", insertable = false, updatable = false)
  private Patient patient;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "scheduleId", insertable = false, updatable = false)
  private Schedule schedule;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
