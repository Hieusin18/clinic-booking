package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "PrescriptionItem")
@Getter
@Setter
public class PrescriptionItem extends BaseEntity {
  private String prescriptionId;
  private String medicineId;
  private int quantity;
  private String dosePerTime;
  private int timesPerDay;
  private int days;
  private String note;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "medicineId", insertable = false, updatable = false)
  private Medicine medicine;
}
