package com.clinic.entity;

import com.clinic.entity.enums.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Tài khoản đăng nhập của cả 4 vai trò. */
@Entity
@Table(name = "User")
@Getter
@Setter
public class User extends BaseEntity {
  private String fullName;
  private String email;
  private String phone;
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  private Role role;

  @Column(name = "isActive")
  private boolean active = true;

  private Instant createdAt;

  /** Tăng lên khi đổi / đặt lại mật khẩu hoặc "đăng xuất mọi thiết bị": mọi token cũ hết hiệu lực */
  private int tokenVersion;
  /** Đang dùng mật khẩu tạm (admin tạo hoặc đặt lại): phải đổi trước khi dùng hệ thống */
  private boolean mustChangePassword;
  /** Số lần nhập sai liên tiếp; đủ 5 lần thì tạm khóa tới lockedUntil */
  private int failedLogins;
  private Instant lockedUntil;
  private Instant lastLoginAt;
  private Instant passwordChangedAt;

  @PrePersist
  void prePersist() {
    assignId();
    if (createdAt == null) createdAt = Instant.now();
  }
}
