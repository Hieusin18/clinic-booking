package com.clinic.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

/** Khóa chính dạng chuỗi UUID (cột TEXT, giống bản cũ). */
@MappedSuperclass
@Getter
@Setter
public abstract class BaseEntity {
  @Id
  @Column(nullable = false, updatable = false)
  private String id;

  @PrePersist
  protected void assignId() {
    if (id == null) id = UUID.randomUUID().toString();
  }
}
