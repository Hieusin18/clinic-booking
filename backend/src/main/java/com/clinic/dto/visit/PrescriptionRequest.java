package com.clinic.dto.visit;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** @param advice lời dặn của bác sĩ */
public record PrescriptionRequest(
    @Size(max = 1000) String advice,
    @NotNull(message = "Đơn thuốc cần ít nhất một loại thuốc") @Size(min = 1, message = "Đơn thuốc cần ít nhất một loại thuốc") List<@Valid Item> items) {

  /**
   * @param quantity tổng số lượng cần mua (theo đơn vị của thuốc)
   * @param dosePerTime liều mỗi lần, ví dụ "1 viên"
   * @param note ví dụ "uống sau ăn"
   */
  public record Item(
      @NotNull String medicineId,
      @NotNull @Min(1) @Max(1000) Integer quantity,
      @NotNull @Size(min = 1, max = 50) String dosePerTime,
      @NotNull @Min(1) @Max(12) Integer timesPerDay,
      @NotNull @Min(1) @Max(90) Integer days,
      @Size(max = 200) String note) {}
}
