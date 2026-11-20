package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Ảnh của banner, tách bảng để danh sách không phải đọc dữ liệu ảnh */
@Entity
@Table(name = "BannerImage")
@Getter
@Setter
public class BannerImage {
  @Id
  private String bannerId;

  private byte[] data;
  private String mimeType;
  private Instant updatedAt;
}
