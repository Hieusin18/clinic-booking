package com.clinic.dto.schedule;

import com.clinic.dto.validation.IsoDate;
import com.clinic.dto.validation.Patterns;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Bác sĩ mở hàng loạt khung giờ trong một ca.
 *
 * @param date ngày khám, dạng YYYY-MM-DD
 * @param start giờ bắt đầu ca, dạng HH:mm (giờ Việt Nam)
 * @param end giờ kết thúc ca, dạng HH:mm
 * @param slotMinutes độ dài mỗi lượt khám (phút)
 */
public record CreateSlotsRequest(
    @NotNull @IsoDate String date,
    @NotNull(message = "Giờ bắt đầu phải có dạng HH:mm") @Pattern(regexp = Patterns.HHMM, message = "Giờ bắt đầu phải có dạng HH:mm") String start,
    @NotNull(message = "Giờ kết thúc phải có dạng HH:mm") @Pattern(regexp = Patterns.HHMM, message = "Giờ kết thúc phải có dạng HH:mm") String end,
    @NotNull @Min(5) @Max(120) Integer slotMinutes) {}
