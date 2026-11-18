package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/**
 * Khung giờ bác sĩ mở cho đặt lịch.
 * Chống đặt trùng: khi đặt, chạy UPDATE ... SET isBooked = true WHERE id = ? AND isBooked = false
 * trong transaction; cập nhật 0 dòng nghĩa là khung giờ vừa bị người khác đặt.
 */
@Entity
@Table(name = "Schedule")
@Getter
@Setter
public class Schedule extends BaseEntity {
  private String doctorId;
  private LocalDate date;
  private Instant startTime;
  private Instant endTime;
  private boolean isBooked;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "doctorId", insertable = false, updatable = false)
  private Doctor doctor;
}
