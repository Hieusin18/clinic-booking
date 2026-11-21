package com.clinic.unit;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.util.WalkInCapacity;
import com.clinic.util.WalkInCapacity.Slot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Sức chứa trong ca bác sĩ: mỗi khung giờ một lượt khám")
class WalkInCapacityTest {
  static final Instant NOW = Instant.parse("2026-11-21T02:00:00Z"); // 9:00 giờ Việt Nam

  static Slot slot(int fromMin, int toMin, boolean booked) {
    return new Slot("s" + fromMin, NOW.plusSeconds(fromMin * 60L), NOW.plusSeconds(toMin * 60L), booked);
  }

  /** Ca từ {@code fromMin} đến {@code toMin} chia khung {@code step} phút */
  static List<Slot> shift(int fromMin, int toMin, int step) {
    List<Slot> out = new ArrayList<>();
    for (int t = fromMin; t < toMin; t += step) out.add(slot(t, t + step, false));
    return out;
  }

  @Test
  @DisplayName("không mở khung giờ nào: không có ca")
  void noShift() {
    WalkInCapacity.Result r = WalkInCapacity.of(List.of(), NOW);
    assertThat(r.hasShift()).isFalse();
    assertThat(r.remaining()).isZero();
  }

  @Test
  @DisplayName("ca 10:00–11:00: khung 15 phút nhận 4 người, khung 30 phút nhận 2 người")
  void slotLength() {
    assertThat(WalkInCapacity.of(shift(60, 120, 15), NOW).remaining()).isEqualTo(4);
    assertThat(WalkInCapacity.of(shift(60, 120, 30), NOW).remaining()).isEqualTo(2);
  }

  @Test
  @DisplayName("khung đã đặt không tính; khung đang diễn ra vẫn nhận và được giữ trước")
  void free() {
    List<Slot> slots = List.of(slot(30, 60, false), slot(-10, 20, false), slot(60, 90, true), slot(-60, -30, false));
    WalkInCapacity.Result r = WalkInCapacity.of(slots, NOW);
    assertThat(r.remaining()).isEqualTo(2);
    assertThat(r.shiftEnd()).isEqualTo(NOW.plusSeconds(90 * 60));
    assertThat(WalkInCapacity.first(slots, NOW).orElseThrow().id()).isEqualTo("s-10");
  }

  @Test
  @DisplayName("đã đặt kín hoặc đã hết ca: không nhận thêm")
  void fullOrOver() {
    assertThat(WalkInCapacity.of(List.of(slot(0, 60, true)), NOW).remaining()).isZero();
    WalkInCapacity.Result over = WalkInCapacity.of(List.of(slot(-120, -60, false)), NOW);
    assertThat(over.shiftOver(NOW)).isTrue();
    assertThat(over.remaining()).isZero();
    assertThat(WalkInCapacity.first(List.of(slot(-120, -60, false)), NOW)).isEmpty();
  }
}
