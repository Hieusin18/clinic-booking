package com.clinic.dto.patient;

import com.clinic.dto.validation.IsoDate;
import com.clinic.dto.validation.Patterns;
import com.clinic.entity.enums.Gender;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Hồ sơ hành chính bệnh nhân (lễ tân tạo).
 *
 * @param dateOfBirth YYYY-MM-DD
 * @param nationalId số CCCD, 12 chữ số
 * @param insuranceNo mã thẻ BHYT
 * @param insuranceExpiry hạn dùng thẻ BHYT, YYYY-MM-DD
 * @param allergies tiền sử dị ứng (thuốc, thức ăn…)
 * @param relativeName người nhà cần báo tin; với trẻ em là người đưa trẻ đến khám
 */
public record PatientRequest(
    @NotNull @Size(min = 2) String fullName,
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @NotNull @IsoDate String dateOfBirth,
    @NotNull Gender gender,
    @Pattern(regexp = "^\\d{12}$", message = "Số CCCD phải gồm 12 chữ số") String nationalId,
    @Size(max = 255) String address,
    @Size(max = 20) String insuranceNo,
    @IsoDate String insuranceExpiry,
    @Size(max = 500) String allergies,
    @Size(max = 100) String occupation,
    @Size(max = 50) String ethnicity,
    @Size(max = 100) String relativeName,
    @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String relativePhone) {}
