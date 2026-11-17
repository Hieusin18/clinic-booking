package com.clinic.util;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Tiện ích thời gian theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
 * Quy ước lưu trữ:
 * <ul>
 *   <li>Cột DATE (ngày khám) lưu ngày theo lịch Việt Nam ({@link LocalDate}).</li>
 *   <li>Cột thời điểm (startTime…) lưu thời điểm thật, dạng UTC ({@link Instant}).</li>
 * </ul>
 */
public final class VnTime {
  public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
  private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
  private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

  private VnTime() {}

  /** Ngày (theo giờ Việt Nam) của một thời điểm. */
  public static LocalDate date(Instant at) {
    return at.atZone(ZONE).toLocalDate();
  }

  /** Ngày hôm nay theo giờ Việt Nam. */
  public static LocalDate today(Instant now) {
    return date(now);
  }

  /** "YYYY-MM-DD" của một thời điểm, tính theo giờ Việt Nam. */
  public static String dateString(Instant at) {
    return date(at).toString();
  }

  /** Thời điểm thật của "YYYY-MM-DD" + "HH:mm" giờ Việt Nam. */
  public static Instant dateTime(String ymd, String hhmm) {
    return ZonedDateTime.of(LocalDate.parse(ymd), LocalTime.parse(hhmm), ZONE).toInstant();
  }

  public static Instant dateTime(LocalDate d, LocalTime t) {
    return ZonedDateTime.of(d, t, ZONE).toInstant();
  }

  /** "HH:mm" giờ Việt Nam của một thời điểm. */
  public static String time(Instant at) {
    return HHMM.format(at.atZone(ZONE));
  }

  /** Giờ (0–23) theo giờ Việt Nam. */
  public static int hour(Instant at) {
    return at.atZone(ZONE).getHour();
  }

  /** "dd/MM/yyyy" của một ngày. */
  public static String dmy(LocalDate d) {
    return DMY.format(d);
  }

  /** Thời điểm 00:00 giờ Việt Nam của một ngày. */
  public static Instant startOfDay(LocalDate d) {
    return d.atStartOfDay(ZONE).toInstant();
  }
}
