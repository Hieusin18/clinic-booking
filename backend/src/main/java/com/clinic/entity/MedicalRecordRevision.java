package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Một lần lưu bệnh án có thay đổi: bản chụp toàn bộ nội dung sau khi lưu (JSON), ai sửa, sửa lúc nào. */
@Entity
@Table(name = "MedicalRecordRevision")
@Getter
@Setter
public class MedicalRecordRevision extends BaseEntity {
  private String recordId;
  private String visitId;
  private int version;
  /** CREATE, UPDATE hoặc BASELINE (nội dung đã có trước khi bật lịch sử) */
  private String action;
  private String editedById;
  private boolean afterDone;
  private String snapshot;
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
