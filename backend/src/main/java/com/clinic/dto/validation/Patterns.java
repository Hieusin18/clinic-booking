package com.clinic.dto.validation;

/** Mẫu kiểm tra dùng chung. */
public final class Patterns {
  public static final String PHONE = "^0\\d{9}$";
  public static final String PHONE_MESSAGE = "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0";
  public static final String HHMM = "^([01]\\d|2[0-3]):[0-5]\\d$";

  private Patterns() {}
}
