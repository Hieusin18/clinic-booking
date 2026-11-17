package com.clinic.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Danh mục thuốc do admin quản lý */
@Entity
@Table(name = "Medicine")
@Getter
@Setter
public class Medicine extends BaseEntity {
  private String name;
  private String activeIngredient;
  private String strength;
  private String unit;

  @Column(name = "isActive")
  private boolean active = true;
}
