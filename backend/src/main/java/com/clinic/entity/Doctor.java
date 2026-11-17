package com.clinic.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Bác sĩ. Hồ sơ (giới thiệu, kinh nghiệm, thế mạnh, quá trình đào tạo và công tác, ảnh)
 * hiện cho bệnh nhân xem trước khi đặt lịch.
 */
@Entity
@Table(name = "Doctor")
@Getter
@Setter
public class Doctor extends BaseEntity {
  private String userId;
  private String specialtyId;
  private String title;
  private String bio;
  /** Phòng khám, ví dụ "Phòng 2"; loa gọi số đọc tên phòng này */
  private String room;
  /** Năm bắt đầu hành nghề */
  private Integer practiceSince;
  /** Thế mạnh chuyên môn, mỗi dòng một mục */
  private String expertise;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "userId", insertable = false, updatable = false)
  private User user;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "specialtyId", insertable = false, updatable = false)
  private Specialty specialty;

}
