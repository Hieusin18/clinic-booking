package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Ảnh đại diện bác sĩ, tách bảng để danh sách bác sĩ không phải đọc dữ liệu ảnh */
@Entity
@Table(name = "DoctorAvatar")
@Getter
@Setter
public class DoctorAvatar {
  @Id
  private String doctorId;

  private byte[] data;
  private String mimeType;
  private Instant updatedAt;
}
