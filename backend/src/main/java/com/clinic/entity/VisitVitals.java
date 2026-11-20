package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Sinh hiệu điều dưỡng đo khi bệnh nhân chờ khám; bác sĩ mở phiếu khám thì điền sẵn vào bệnh án. */
@Entity
@Table(name = "VisitVitals")
@Getter
@Setter
public class VisitVitals extends BaseEntity {
  private String visitId;
  private Integer pulse;
  private Double temperature;
  private Integer bpSystolic;
  private Integer bpDiastolic;
  private Integer respiratoryRate;
  private Integer spo2;
  private Double weight;
  private Double height;
  private String note;
  private String measuredById;
  private Instant measuredAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (measuredAt == null) measuredAt = Instant.now();
  }
}
