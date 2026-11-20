package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/** Bệnh án ngoại trú của một lượt khám, theo bố cục mẫu bệnh án Bộ Y tế. Chỉ bác sĩ phụ trách được ghi. */
@Entity
@Table(name = "MedicalRecord")
@Getter
@Setter
public class MedicalRecord extends BaseEntity {
  private String visitId;

  // III. Hỏi bệnh
  /** Lý do đến khám */
  private String reason;
  /** Quá trình bệnh lý (bệnh sử, triệu chứng) */
  private String symptoms;
  private String personalHistory;
  private String familyHistory;

  // IV. Khám bệnh: dấu hiệu sinh tồn
  private Integer pulse;
  private Double temperature;
  private Integer bpSystolic;
  private Integer bpDiastolic;
  private Integer respiratoryRate;
  private Integer spo2;
  private Double weight;
  private Double height;
  private String generalExam;
  private String organExam;
  /** Tóm tắt kết quả cận lâm sàng */
  private String labSummary;
  /** Chỉ định cận lâm sàng */
  private String orders;

  // V. Chẩn đoán (mã ICD-10)
  private String diagnosis;
  private String icdCode;
  private String secondaryDiagnosis;
  /** Mã ICD-10 bệnh kèm theo, cách nhau bởi dấu phẩy */
  private String secondaryIcdCodes;

  // VI. Điều trị
  private String treatment;
  private LocalDate followUpDate;
  /** Đã nhắc bệnh nhân đặt lịch tái khám */
  private Instant followUpRemindedAt;

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
