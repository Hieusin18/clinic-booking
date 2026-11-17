package com.clinic.entity;

import com.clinic.entity.enums.DoctorHistoryKind;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Một mốc trong quá trình đào tạo hoặc công tác của bác sĩ */
@Entity
@Table(name = "DoctorHistory")
@Getter
@Setter
public class DoctorHistory extends BaseEntity {
  private String doctorId;

  @Enumerated(EnumType.STRING)
  private DoctorHistoryKind kind;

  private int fromYear;
  /** null = đến nay */
  private Integer toYear;
  /** Chức vụ, vị trí (công tác) hoặc văn bằng (đào tạo) */
  private String title;
  /** Nơi công tác hoặc cơ sở đào tạo */
  private String place;
}
