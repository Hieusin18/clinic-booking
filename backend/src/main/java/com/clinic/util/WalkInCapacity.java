package com.clinic.util;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Sức chứa của bác sĩ hôm nay tính theo khung giờ: mỗi khung giờ bác sĩ mở là một lượt khám, dùng chung cho người đặt
 * lịch và khách vãng lai. Ca 10:00–11:00 chia khung 15 phút nhận 4 người, chia 30 phút nhận 2 người.
 *
 * <p>Khách vãng lai giữ khung trống sớm nhất chưa kết thúc (kể cả khung đang diễn ra). Hết khung trống là hết nhận.
 */
public final class WalkInCapacity {
  private WalkInCapacity() {}

  /** Một khung giờ trong ngày */
  public record Slot(String id, Instant start, Instant end, boolean booked) {}

  /**
   * @param hasShift bác sĩ có mở khung giờ nào hôm nay không
   * @param shiftEnd giờ kết thúc khung cuối cùng hôm nay (null = không có ca)
   * @param remaining số khung còn trống chưa kết thúc = số người còn nhận
   */
  public record Result(boolean hasShift, Instant shiftEnd, int remaining) {
    public boolean shiftOver(Instant now) {
      return hasShift && !shiftEnd.isAfter(now);
    }
  }

  static boolean open(Slot s, Instant now) {
    return !s.booked() && s.end().isAfter(now);
  }

  public static Result of(List<Slot> slots, Instant now) {
    if (slots.isEmpty()) return new Result(false, null, 0);
    Instant shiftEnd = slots.stream().map(Slot::end).max(Instant::compareTo).orElseThrow();
    int remaining = (int) slots.stream().filter(s -> open(s, now)).count();
    return new Result(true, shiftEnd, remaining);
  }

  /** Các khung còn nhận, sớm nhất trước (khách vãng lai giữ khung đầu tiên) */
  public static List<Slot> openSlots(List<Slot> slots, Instant now) {
    return slots.stream().filter(s -> open(s, now)).sorted(Comparator.comparing(Slot::start)).toList();
  }

  public static Optional<Slot> first(List<Slot> slots, Instant now) {
    return openSlots(slots, now).stream().findFirst();
  }
}
