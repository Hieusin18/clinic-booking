package com.clinic.unit;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.CallRule;
import com.clinic.entity.enums.VisitSource;
import com.clinic.util.OrderRules;
import com.clinic.util.QueueOrder;
import com.clinic.util.QueueRules;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Thứ tự gọi số và quy tắc hàng đợi")
class QueueOrderTest {
  /** Giờ Việt Nam trong một ngày cố định */
  static Instant at(String hhmm) {
    return java.time.OffsetDateTime.parse("2026-11-09T" + hhmm + ":00+07:00").toInstant();
  }

  record Rules(int leadMinutes, int walkInEvery, int avgExamMinutes) implements OrderRules {}

  static final Rules RULES = new Rules(10, 3, 12);
  static int n = 0;

  record Person(String name, VisitSource source, int queueNumber, Instant createdAt, Instant appointmentAt, Instant resultsReadyAt)
      implements QueueOrder.Entry {}

  static Person walkIn(String name, String arrived) {
    return new Person(name, VisitSource.WALK_IN, ++n, at(arrived), null, null);
  }

  static Person booked(String name, String arrived, String appt) {
    return new Person(name, VisitSource.ONLINE, ++n, at(arrived), at(appt), null);
  }

  static Person withResults(Person p, String ready) {
    return new Person(p.name(), p.source(), p.queueNumber(), p.createdAt(), p.appointmentAt(), at(ready));
  }

  /** Chạy một buổi khám: ở mỗi lần gọi, hàng chờ gồm người đã đến và chưa được gọi. */
  static List<String> runSession(List<Person> people, String... callTimes) {
    List<String> called = new ArrayList<>();
    int streak = 0;
    for (String t : callTimes) {
      List<Person> waiting = people.stream().filter(p -> !p.createdAt().isAfter(at(t)) && called.stream().noneMatch(c -> c.startsWith(p.name() + ":")))
          .toList();
      var pick = QueueOrder.pickNext(waiting, streak, at(t), RULES);
      if (pick == null) break;
      called.add(pick.entry().name() + ":" + pick.rule());
      streak = QueueOrder.nextStreak(streak, pick.rule());
    }
    return called;
  }

  @Test
  @DisplayName("ví dụ buổi sáng của BS Bình: ưu tiên giờ hẹn, người đến sớm không chiếm chỗ")
  void morning() {
    var people = List.of(walkIn("Hùng", "07:40"), booked("Lan", "07:45", "08:00"), walkIn("Hoa", "07:50"), booked("Minh", "08:05", "08:30"),
        walkIn("Tuấn", "08:10"), booked("Ngọc", "08:20", "08:15"));
    assertThat(runSession(people, "08:00", "08:12", "08:24", "08:36", "08:48", "09:00"))
        .containsExactly("Lan:APPOINTMENT", "Hùng:ARRIVAL", "Ngọc:APPOINTMENT", "Minh:APPOINTMENT", "Hoa:ARRIVAL", "Tuấn:ARRIVAL");
  }

  @Test
  @DisplayName("sau 3 lượt ưu tiên liên tiếp thì gọi một người vãng lai")
  void fairness() {
    var people = List.of(walkIn("Mai", "08:50"), booked("A", "08:55", "09:00"), booked("B", "08:55", "09:12"), booked("C", "08:55", "09:24"),
        booked("D", "08:55", "09:36"));
    assertThat(runSession(people, "09:00", "09:12", "09:24", "09:36", "09:48"))
        .containsExactly("A:APPOINTMENT", "B:APPOINTMENT", "C:APPOINTMENT", "Mai:FAIRNESS", "D:APPOINTMENT");
  }

  @Test
  @DisplayName("walkInEvery = 0 thì tắt bước nhường người vãng lai")
  void fairnessOff() {
    var waiting = List.of(walkIn("Mai", "08:00"), booked("D", "08:30", "09:00"));
    assertThat(QueueOrder.pickNext(waiting, 10, at("09:00"), new Rules(10, 0, 12)).entry().name()).isEqualTo("D");
  }

  @Test
  @DisplayName("người đặt lịch được ưu tiên từ giờ hẹn trừ 10 phút")
  void leadTime() {
    var waiting = List.of(walkIn("Hùng", "08:00"), booked("Lan", "08:05", "08:30"));
    assertThat(QueueOrder.pickNext(waiting, 0, at("08:19"), RULES).entry().name()).isEqualTo("Hùng");
    assertThat(QueueOrder.pickNext(waiting, 0, at("08:20"), RULES).entry().name()).isEqualTo("Lan");
  }

  @Test
  @DisplayName("người quay lại với kết quả cận lâm sàng được gọi trước cả người đặt lịch đến giờ")
  void resultsFirst() {
    var lan = booked("Lan", "08:00", "08:15");
    var hung = withResults(walkIn("Hùng", "07:50"), "08:40");
    var mai = withResults(walkIn("Mai", "07:55"), "08:30");
    var pick = QueueOrder.pickNext(List.of(lan, hung, mai), 3, at("08:45"), RULES);
    // Mai có kết quả trước Hùng; bước nhường vãng lai (streak = 3) cũng đứng sau
    assertThat(pick.entry().name()).isEqualTo("Mai");
    assertThat(pick.rule()).isEqualTo(CallRule.RESULTS);
    // Đọc kết quả không làm đổi chuỗi ưu tiên
    assertThat(QueueOrder.nextStreak(3, CallRule.RESULTS)).isEqualTo(3);
    assertThat(QueueOrder.currentStreak(List.of(CallRule.RESULTS, CallRule.APPOINTMENT, CallRule.APPOINTMENT))).isEqualTo(2);
    var order = QueueOrder.predictOrder(List.of(lan, hung, mai), 0, at("08:45"), RULES, null).stream().map(p -> p.entry().name()).toList();
    assertThat(order).containsExactly("Mai", "Hùng", "Lan");
  }

  @Test
  @DisplayName("hàng chờ trống thì không gọi ai")
  void empty() {
    assertThat(QueueOrder.pickNext(List.<Person>of(), 0, at("08:00"), RULES)).isNull();
  }

  @Test
  @DisplayName("đếm lượt ưu tiên liên tiếp: bỏ qua lượt gọi đích danh, dừng ở lượt gọi khác")
  void streak() {
    assertThat(QueueOrder.currentStreak(List.of(CallRule.APPOINTMENT, CallRule.MANUAL, CallRule.APPOINTMENT, CallRule.ARRIVAL, CallRule.APPOINTMENT)))
        .isEqualTo(2);
    assertThat(QueueOrder.currentStreak(Arrays.asList(null, CallRule.APPOINTMENT))).isZero();
    assertThat(QueueOrder.nextStreak(2, CallRule.MANUAL)).isEqualTo(2);
    assertThat(QueueOrder.nextStreak(2, CallRule.FAIRNESS)).isZero();
  }

  @Test
  @DisplayName("dự đoán thứ tự: người vãng lai thấy cả người đặt lịch sẽ đến giờ trước mình")
  void predict() {
    var hung = walkIn("Hùng", "08:00");
    var lan = booked("Lan", "08:05", "08:20");
    var predicted = QueueOrder.predictOrder(List.of(hung, lan), 0, at("08:00"), RULES, at("08:10"));
    // Bác sĩ đang khám đến 08:10 → gọi Lan lúc 08:10 (đã đến giờ 08:20 − 10), rồi Hùng lúc 08:22
    assertThat(predicted.get(0).entry().name()).isEqualTo("Lan");
    assertThat(predicted.get(0).order()).isZero();
    assertThat(predicted.get(0).estimatedAt()).isEqualTo(at("08:10"));
    assertThat(predicted.get(1).entry().name()).isEqualTo("Hùng");
    assertThat(predicted.get(1).order()).isEqualTo(1);
    assertThat(predicted.get(1).estimatedAt()).isEqualTo(at("08:22"));
  }

  @Test
  @DisplayName("nhãn số A cho đặt lịch, B cho vãng lai")
  void labels() {
    assertThat(QueueOrder.ticketLabel(VisitSource.ONLINE, 1)).isEqualTo("A01");
    assertThat(QueueOrder.ticketLabel(VisitSource.WALK_IN, 12)).isEqualTo("B12");
  }

  @Nested
  @DisplayName("cấu hình và khóa đặt lịch")
  class Config {
    LocalDate day(String ymd) {
      return LocalDate.parse(ymd);
    }

    @Test
    @DisplayName("đọc mốc thời gian từ biến môi trường, bỏ trống hoặc sai thì dùng mặc định")
    void fromEnv() {
      Map<String, String> env = new HashMap<>(Map.of("CHECKIN_EARLY_MINUTES", "45", "CHECKIN_LATE_MINUTES", "", "QUEUE_WALK_IN_EVERY", "abc",
          "NO_SHOW_LIMIT", "-1"));
      QueueRules r = QueueRules.from(env::get);
      assertThat(r.checkinEarlyMinutes()).isEqualTo(45);
      assertThat(r.checkinLateMinutes()).isEqualTo(15);
      assertThat(r.walkInEvery()).isEqualTo(3);
      assertThat(r.noShowLimit()).isEqualTo(3);
      assertThat(QueueRules.from(k -> null)).isEqualTo(QueueRules.DEFAULT);
    }

    @Test
    @DisplayName("3 lần không đến trong 30 ngày thì khóa 14 ngày tính từ lần gần nhất")
    void lock() {
      var s = QueueRules.DEFAULT.noShowStanding(List.of(day("2026-11-01"), day("2026-10-20"), day("2026-10-10")), day("2026-11-07"));
      assertThat(s.recentNoShows()).isEqualTo(3);
      assertThat(s.lockedUntil()).isEqualTo(day("2026-11-15"));
    }

    @Test
    @DisplayName("hết hạn khóa thì đặt lại được; 3 lần cách nhau quá 30 ngày thì không khóa")
    void unlock() {
      var dates = List.of(day("2026-11-01"), day("2026-10-20"), day("2026-10-10"));
      assertThat(QueueRules.DEFAULT.noShowStanding(dates, day("2026-11-16")).lockedUntil()).isNull();
      var spread = QueueRules.DEFAULT.noShowStanding(List.of(day("2026-11-05"), day("2026-10-20"), day("2026-10-01")), day("2026-11-07"));
      assertThat(spread.recentNoShows()).isEqualTo(2);
      assertThat(spread.lockedUntil()).isNull();
    }
  }
}
