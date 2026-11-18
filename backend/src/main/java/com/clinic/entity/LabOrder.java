package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Một chỉ định cận lâm sàng (X-quang, siêu âm, xét nghiệm…). Bác sĩ phụ trách ghi kết quả và tải tệp lên. */
@Entity
@Table(name = "LabOrder")
@Getter
@Setter
public class LabOrder extends BaseEntity {
  private String visitId;
  /** Tên chỉ định, ví dụ "X-quang ngực thẳng" */
  private String name;
  /** Ghi chú kèm chỉ định (vị trí, yêu cầu) */
  private String note;
  /** Mô tả và kết luận kết quả */
  private String resultText;
  /** Lúc bác sĩ trả kết quả; null = chưa có kết quả */
  private Instant doneAt;
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
