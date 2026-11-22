package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Một cài đặt của phòng khám (khóa → giá trị) do admin đổi trên web */
@Entity
@Table(name = "ClinicSetting")
@Getter
@Setter
public class ClinicSetting {
  @Id
  private String key;

  private String value;
  private String updatedById;
  private Instant updatedAt;
}
