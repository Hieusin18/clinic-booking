package com.clinic.unit;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.util.WalkInCapacity;
import com.clinic.util.WalkInCapacity.Slot;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Sức chứa khách vãng lai trong ca bác sĩ")
class WalkInCapacityTest {
  static final Instant NOW = Instant.parse("2026-11-21T02:00:00Z"); // 9:00 giờ Việt Nam

  static Slot slot(int fromMin, int toMin, boolean booked) {
    return new Slot(NOW.plusSeconds(fromMin * 60L), NOW.plusSeconds(toMin * 60L), booked);
  }

  @Test
  @DisplayName("không mở khung giờ nào: không có ca")
  void noShift() {
    WalkInCapacity.Result r = WalkInCapacity.of(List.of(), NOW, 0, 12);
    assertThat(r.hasShift()).isFalse();
    assertThat(r.remaining()).isZero();
  }

  @Test
  @DisplayName("thời gian rảnh = phần còn lại của khung chưa đặt; trừ người vãng lai đang chờ")
  void free() {
    // 8:30–9:30 đang diễn ra (còn 30 phút), 9:30–10:30 trống, 10:30–11:00 đã có người đặt
    List<Slot> slots = List.of(slot(-30, 30, false), slot(30, 90, false), slot(90, 120, true));
    WalkInCapacity.Result r = WalkInCapacity.of(slots, NOW, 0, 12);
    assertThat(r.freeMinutes()).isEqualTo(90);
    assertThat(r.remaining()).isEqualTo(7);
    assertThat(r.shiftEnd()).isEqualTo(NOW.plusSeconds(120 * 60));
    assertThat(WalkInCapacity.of(slots, NOW, 7, 12).remaining()).isZero();
    assertThat(WalkInCapacity.of(slots, NOW, 5, 12).remaining()).isEqualTo(2);
  }

  @Test
  @DisplayName("đã đặt kín hoặc đã hết ca: không nhận thêm")
  void fullOrOver() {
    assertThat(WalkInCapacity.of(List.of(slot(0, 60, true)), NOW, 0, 12).remaining()).isZero();
    WalkInCapacity.Result over = WalkInCapacity.of(List.of(slot(-120, -60, false)), NOW, 0, 12);
    assertThat(over.shiftOver(NOW)).isTrue();
    assertThat(over.remaining()).isZero();
  }
}
