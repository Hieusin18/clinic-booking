package com.clinic.entity;

import jakarta.persistence.Basic;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Tệp kết quả (ảnh chụp phim, phiếu kết quả PDF). Tách bảng để danh sách không phải đọc dữ liệu tệp. */
@Entity
@Table(name = "LabFile")
@Getter
@Setter
public class LabFile extends BaseEntity {
  private String labOrderId;
  private String fileName;
  private String mimeType;
  private int size;

  @Basic(fetch = FetchType.LAZY)
  private byte[] data;

  private Instant createdAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
