package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "Specialty")
@Getter
@Setter
public class Specialty extends BaseEntity {
  private String name;
  private String description;
}
