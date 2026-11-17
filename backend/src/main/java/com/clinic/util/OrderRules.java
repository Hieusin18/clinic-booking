package com.clinic.util;

/** Các mốc dùng để chọn thứ tự gọi số (xem {@link QueueOrder}). */
public interface OrderRules {
  /** Người đặt lịch được ưu tiên từ giờ hẹn trừ chừng này phút */
  int leadMinutes();

  /** Sau chừng này lượt ưu tiên liên tiếp thì gọi một người vãng lai; 0 = tắt */
  int walkInEvery();

  /** Thời gian khám trung bình, chỉ dùng để ước tính giờ được gọi */
  int avgExamMinutes();
}
