package com.clinic.util;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;

/**
 * Các mốc thời gian của hàng đợi; đổi được trong .env mà không phải sửa code.
 *
 * @param checkinEarlyMinutes được check-in lịch hẹn sớm nhất trước giờ hẹn chừng này phút
 * @param checkinLateMinutes quá giờ hẹn chừng này phút mà chưa check-in thì lịch hẹn thành "không đến"
 * @param dayEndHour sau giờ này (giờ Việt Nam) người còn đang chờ được tính là bỏ về
 * @param noShowLimit không đến chừng này lần trong {@code noShowWindowDays} ngày thì bị khóa đặt lịch online
 */
public record QueueRules(
    int leadMinutes,
    int walkInEvery,
    int avgExamMinutes,
    int checkinEarlyMinutes,
    int checkinLateMinutes,
    int dayEndHour,
    int noShowLimit,
    int noShowWindowDays,
    int noShowLockDays) implements OrderRules {

  public static final QueueRules DEFAULT = new QueueRules(10, 3, 12, 30, 15, 21, 3, 30, 14);

  /** Đọc từ biến môi trường; bỏ trống hoặc sai định dạng (không phải số nguyên ≥ 0) thì dùng giá trị mặc định. */
  public static QueueRules from(Function<String, String> env) {
    QueueRules d = DEFAULT;
    return new QueueRules(
        read(env, "QUEUE_PRIORITY_LEAD_MINUTES", d.leadMinutes),
        read(env, "QUEUE_WALK_IN_EVERY", d.walkInEvery),
        read(env, "QUEUE_AVG_EXAM_MINUTES", d.avgExamMinutes),
        read(env, "CHECKIN_EARLY_MINUTES", d.checkinEarlyMinutes),
        read(env, "CHECKIN_LATE_MINUTES", d.checkinLateMinutes),
        read(env, "QUEUE_DAY_END_HOUR", d.dayEndHour),
        read(env, "NO_SHOW_LIMIT", d.noShowLimit),
        read(env, "NO_SHOW_WINDOW_DAYS", d.noShowWindowDays),
        read(env, "NO_SHOW_LOCK_DAYS", d.noShowLockDays));
  }

  private static int read(Function<String, String> env, String key, int fallback) {
    String raw = env.apply(key);
    if (raw == null || raw.trim().isEmpty()) return fallback;
    try {
      int n = Integer.parseInt(raw.trim());
      return n >= 0 ? n : fallback;
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  /** Tình trạng "không đến" của một bệnh nhân: số lần gần đây và ngày cuối bị khóa (null = không bị khóa). */
  public record NoShowStanding(int recentNoShows, LocalDate lockedUntil) {}

  /**
   * {@code dates} = ngày khám của các lịch hẹn bị tính là không đến. Đủ {@code noShowLimit} lần trong vòng
   * {@code noShowWindowDays} ngày thì bị khóa đặt lịch online đến hết ngày (lần gần nhất + {@code noShowLockDays}).
   */
  public NoShowStanding noShowStanding(List<LocalDate> dates, LocalDate today) {
    List<LocalDate> sorted = new ArrayList<>(dates);
    sorted.sort(Comparator.reverseOrder());
    int recent = (int) sorted.stream().filter(d -> today.toEpochDay() - d.toEpochDay() < noShowWindowDays).count();
    LocalDate lockedUntil = null;
    int k = noShowLimit;
    if (k > 0) {
      for (int i = 0; i + k - 1 < sorted.size(); i++) {
        if (sorted.get(i).toEpochDay() - sorted.get(i + k - 1).toEpochDay() < noShowWindowDays) {
          LocalDate until = sorted.get(i).plusDays(noShowLockDays);
          if (!until.isBefore(today)) lockedUntil = until;
          break;
        }
      }
    }
    return new NoShowStanding(recent, lockedUntil);
  }

}
