package com.clinic.entity;

import com.clinic.entity.enums.Gender;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/**
 * Hồ sơ hành chính. userId null = bệnh nhân đến trực tiếp, chưa có tài khoản app;
 * khi đăng ký app bằng cùng SĐT thì gắn userId vào hồ sơ này.
 */
@Entity
@Table(name = "Patient")
@Getter
@Setter
public class Patient extends BaseEntity {
  private String userId;
  private String fullName;
  private LocalDate dateOfBirth;

  @Enumerated(EnumType.STRING)
  private Gender gender;

  private String phone;
  private String nationalId;
  private String address;
  private String insuranceNo;
  /** Hạn dùng thẻ BHYT */
  private LocalDate insuranceExpiry;
  private String allergies;
  private String occupation;
  private String ethnicity;
  /** Người nhà cần báo tin (với trẻ em: người đưa trẻ đến khám) */
  private String relativeName;
  private String relativePhone;
  private Instant createdAt;

  /** Mã liên kết in trên phiếu khám / bệnh án: bệnh nhân nhập trên app để xem lịch sử khám cũ */
  private String linkCode;
  /**
   * Tài khoản app vừa gắn vào hồ sơ có sẵn mà chưa xác minh: lượt khám tạo trước mốc này bị ẩn,
   * thông tin cá nhân lễ tân đã nhập bị che. Xác minh (mã liên kết hoặc lễ tân xem CCCD) thì xóa mốc.
   */
  private Instant historyLockedBefore;
  private Instant verifiedAt;
  /** Nhập sai mã liên kết liên tiếp; đủ 5 lần thì khóa nhập mã tới verifyLockedUntil */
  private int verifyFailures;
  private Instant verifyLockedUntil;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "userId", insertable = false, updatable = false)
  private User user;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
