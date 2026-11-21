package com.clinic.util;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Còn nhận được bao nhiêu khách vãng lai cho một bác sĩ hôm nay.
 *
 * <p>Thời gian bác sĩ rảnh = tổng phần còn lại (sau "bây giờ") của các khung giờ đã mở mà chưa ai đặt. Mỗi người vãng
 * lai đang chờ chiếm một lượt khám trung bình. Còn nhận = (thời gian rảnh − thời gian của người vãng lai đang chờ) ÷ thời
 * gian một lượt. Người đặt lịch đã có khung giờ riêng nên không trừ thêm.
 */
public final class WalkInCapacity {
  private WalkInCapacity() {}

  /** Một khung giờ trong ngày */
  public record Slot(Instant start, Instant end, boolean booked) {}

  /**
   * @param hasShift bác sĩ có mở khung giờ nào hôm nay không
   * @param shiftEnd giờ kết thúc khung cuối cùng hôm nay (null = không có ca)
   * @param freeMinutes số phút rảnh còn lại
   * @param remaining còn nhận được bao nhiêu người vãng lai (≥ 0)
   */
  public record Result(boolean hasShift, Instant shiftEnd, long freeMinutes, int waitingWalkIns, int remaining) {
    public boolean shiftOver(Instant now) {
      return hasShift && !shiftEnd.isAfter(now);
    }
  }

  public static Result of(List<Slot> slots, Instant now, int waitingWalkIns, int avgExamMinutes) {
    if (slots.isEmpty()) return new Result(false, null, 0, waitingWalkIns, 0);
    Instant shiftEnd = slots.stream().map(Slot::end).max(Instant::compareTo).orElseThrow();
    long free = 0;
    for (Slot s : slots) {
      if (s.booked() || !s.end().isAfter(now)) continue;
      Instant from = s.start().isAfter(now) ? s.start() : now;
      free += Duration.between(from, s.end()).toMinutes();
    }
    int per = Math.max(1, avgExamMinutes);
    long left = free - (long) waitingWalkIns * per;
    int remaining = left <= 0 ? 0 : (int) (left / per);
    return new Result(true, shiftEnd, free, waitingWalkIns, remaining);
  }
}
