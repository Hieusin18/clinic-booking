package com.clinic.entity;

import com.clinic.entity.enums.CallRule;
import com.clinic.entity.enums.CheckinMethod;
import com.clinic.entity.enums.ResultMode;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/**
 * Phiếu khám = một vị trí trong hàng đợi của bác sĩ.
 * Hai dãy số: A (đặt lịch, ONLINE) và B (vãng lai, WALK_IN), mỗi dãy đánh số từ 1 mỗi ngày.
 * Cấp số trong transaction; unique (doctorId, date, source, queueNumber) chặn trùng số.
 */
@Entity
@Table(name = "Visit")
@Getter
@Setter
public class Visit extends BaseEntity {
  private String patientId;
  private String doctorId;
  private LocalDate date;
  private int queueNumber;

  @Enumerated(EnumType.STRING)
  private VisitSource source;

  @Enumerated(EnumType.STRING)
  private CheckinMethod checkinMethod;

  @Enumerated(EnumType.STRING)
  private VisitStatus status = VisitStatus.WAITING;

  private String reason;
  private String appointmentId;
  /** Giờ hẹn của lượt đặt online; người đặt lịch được ưu tiên gọi từ giờ hẹn trừ vài phút */
  private Instant appointmentAt;
  /** Lễ tân check-in ngoài khung giờ cho phép (đến quá sớm hoặc quá trễ) */
  private boolean checkinOverride;
  private Instant calledAt;

  @Enumerated(EnumType.STRING)
  private CallRule callRule;

  /** Cách nhận kết quả cận lâm sàng; null = chưa gửi đi làm cận lâm sàng */
  @Enumerated(EnumType.STRING)
  private ResultMode resultMode;

  /** Lúc bác sĩ gửi đi làm cận lâm sàng */
  private Instant sentForTestsAt;
  /** Lúc có kết quả và bệnh nhân vào lại hàng chờ (chế độ quay lại) */
  private Instant resultsReadyAt;
  /** Lúc bác sĩ hoàn tất lượt khám (thống kê thời gian khám) */
  private Instant completedAt;
  private Instant createdAt;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "patientId", insertable = false, updatable = false)
  private Patient patient;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "doctorId", insertable = false, updatable = false)
  private Doctor doctor;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "appointmentId", insertable = false, updatable = false)
  private Appointment appointment;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
