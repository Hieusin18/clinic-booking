package com.clinic.dto.doctor;

import com.clinic.util.DoctorProfile;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Một mốc đào tạo / công tác.
 *
 * @param toYear bỏ trống hoặc null = đến nay
 * @param title chức vụ, vị trí (công tác) hoặc văn bằng (đào tạo)
 * @param place nơi công tác hoặc cơ sở đào tạo
 */
public record HistoryEntry(
    @NotNull @Min(1950) @Max(2100) Integer fromYear,
    @Min(1950) @Max(2100) Integer toYear,
    @NotNull @Size(min = 2, max = 200) String title,
    @NotNull @Size(min = 2, max = 200) String place) implements DoctorProfile.Entry {}
