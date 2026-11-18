package com.clinic.util;

import com.clinic.entity.enums.CallRule;
import com.clinic.entity.enums.VisitSource;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Thứ tự gọi số. Mỗi lần bác sĩ bấm "Gọi số tiếp theo", xét lần lượt:
 * <ol start="0">
 *   <li>Người quay lại với kết quả cận lâm sàng → gọi người có kết quả sớm nhất (không tính vào chuỗi ưu tiên).</li>
 *   <li>Người vãng lai chờ quá lâu: đã có {@code walkInEvery} lượt liên tiếp gọi người đặt lịch (bước 2)
 *       mà vẫn còn người vãng lai chờ → gọi người vãng lai đến quầy sớm nhất.</li>
 *   <li>Người đặt lịch đã đến giờ hẹn (bây giờ ≥ giờ hẹn − {@code leadMinutes}) → gọi người có giờ hẹn sớm nhất.</li>
 *   <li>Còn lại → gọi người đến quầy sớm nhất (gồm cả người đặt lịch đến sớm, để bác sĩ không phải chờ).</li>
 * </ol>
 * Cùng một hàm dùng để gọi số và để dự đoán "trước bạn còn mấy người", nên con số hiện trên app luôn khớp
 * với cách bác sĩ gọi.
 */
public final class QueueOrder {
  private static final long MINUTE = 60_000;
  private static final Set<CallRule> NEUTRAL = Set.of(CallRule.MANUAL, CallRule.RESULTS);

  private QueueOrder() {}

  /** Một người đang chờ trong hàng đợi. */
  public interface Entry {
    VisitSource source();

    int queueNumber();

    /** Lúc lấy số / check-in, tức thứ tự đến quầy */
    Instant createdAt();

    /** Giờ hẹn, chỉ có ở lượt đặt online */
    Instant appointmentAt();

    /** Lúc quay lại hàng chờ với kết quả cận lâm sàng */
    Instant resultsReadyAt();
  }

  /** Kết quả chọn người gọi tiếp theo. */
  public record Pick<T extends Entry>(T entry, CallRule rule) {}

  /** Thứ tự dự đoán của một người: order 0 = người tiếp theo; estimatedAt = ước tính giờ được gọi. */
  public record Predicted<T extends Entry>(T entry, int order, Instant estimatedAt) {}

  /** Người đặt lịch đã "đến giờ hẹn" tại thời điểm {@code at} chưa. */
  public static boolean isDue(Entry e, Instant at, OrderRules rules) {
    return e.source() == VisitSource.ONLINE && e.appointmentAt() != null
        && e.appointmentAt().toEpochMilli() - rules.leadMinutes() * MINUTE <= at.toEpochMilli();
  }

  private static <T extends Entry> Comparator<T> byArrival() {
    return Comparator.<T, Instant>comparing(Entry::createdAt).thenComparingInt(Entry::queueNumber);
  }

  /** Chọn người được gọi tiếp theo trong số đang chờ. {@code streak} = số lượt bước 2 liên tiếp gần nhất. */
  public static <T extends Entry> Pick<T> pickNext(List<T> waiting, int streak, Instant at, OrderRules rules) {
    if (waiting.isEmpty()) return null;

    T back = waiting.stream().filter(e -> e.resultsReadyAt() != null)
        .min(Comparator.<T, Instant>comparing(Entry::resultsReadyAt).thenComparing(byArrival())).orElse(null);
    if (back != null) return new Pick<>(back, CallRule.RESULTS);

    if (rules.walkInEvery() > 0 && streak >= rules.walkInEvery()) {
      T walkIn = waiting.stream().filter(e -> e.source() == VisitSource.WALK_IN).min(byArrival()).orElse(null);
      if (walkIn != null) return new Pick<>(walkIn, CallRule.FAIRNESS);
    }

    T due = waiting.stream().filter(e -> isDue(e, at, rules))
        .min(Comparator.<T, Instant>comparing(Entry::appointmentAt).thenComparing(byArrival())).orElse(null);
    if (due != null) return new Pick<>(due, CallRule.APPOINTMENT);

    return new Pick<>(waiting.stream().min(byArrival()).orElseThrow(), CallRule.ARRIVAL);
  }

  /** Số lượt bước 2 liên tiếp sau khi gọi theo {@code rule}. */
  public static int nextStreak(int streak, CallRule rule) {
    if (NEUTRAL.contains(rule)) return streak;
    return rule == CallRule.APPOINTMENT ? streak + 1 : 0;
  }

  /** Đếm số lượt bước 2 liên tiếp từ các lượt đã gọi trong ngày, mới nhất trước. */
  public static int currentStreak(List<CallRule> recent) {
    int n = 0;
    for (CallRule rule : recent) {
      if (rule != null && NEUTRAL.contains(rule)) continue;
      if (rule != CallRule.APPOINTMENT) break;
      n++;
    }
    return n;
  }

  /**
   * Dự đoán thứ tự gọi cho toàn bộ người đang chờ: chạy thử {@link #pickNext} liên tục, mỗi lượt khám mất
   * {@code avgExamMinutes}. {@code busyUntil} = lúc bác sĩ xong lượt đang khám (nếu có).
   */
  public static <T extends Entry> List<Predicted<T>> predictOrder(List<T> waiting, int streak, Instant now, OrderRules rules, Instant busyUntil) {
    List<T> left = new ArrayList<>(waiting);
    List<Predicted<T>> out = new ArrayList<>();
    long at = Math.max(now.toEpochMilli(), busyUntil == null ? 0 : busyUntil.toEpochMilli());
    int s = streak;
    while (!left.isEmpty()) {
      Pick<T> pick = pickNext(left, s, Instant.ofEpochMilli(at), rules);
      out.add(new Predicted<>(pick.entry(), out.size(), Instant.ofEpochMilli(at)));
      left.remove(pick.entry());
      s = nextStreak(s, pick.rule());
      at += rules.avgExamMinutes() * MINUTE;
    }
    return out;
  }

  /** Nhãn số hiển thị: A01 (đặt lịch), B03 (vãng lai). */
  public static String ticketLabel(VisitSource source, int queueNumber) {
    return (source == VisitSource.ONLINE ? "A" : "B") + String.format("%02d", queueNumber);
  }
}
