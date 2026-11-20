package com.clinic.dto.shift;

import com.clinic.dto.validation.IsoDate;
import com.clinic.dto.validation.Patterns;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Admin xếp một ca trực cho lễ tân.
 *
 * @param userId tài khoản lễ tân
 * @param date ngày trực, dạng YYYY-MM-DD
 * @param start giờ vào ca, dạng HH:mm (giờ Việt Nam)
 * @param end giờ hết ca, dạng HH:mm
 * @param note ghi chú (vd. "Quầy 1")
 */
public record ShiftRequest(
    @NotBlank(message = "Chọn lễ tân") String userId,
    @NotNull @IsoDate String date,
    @NotNull(message = "Giờ bắt đầu phải có dạng HH:mm") @Pattern(regexp = Patterns.HHMM, message = "Giờ bắt đầu phải có dạng HH:mm") String start,
    @NotNull(message = "Giờ kết thúc phải có dạng HH:mm") @Pattern(regexp = Patterns.HHMM, message = "Giờ kết thúc phải có dạng HH:mm") String end,
    @Size(max = 100, message = "Ghi chú tối đa 100 ký tự") String note) {}
