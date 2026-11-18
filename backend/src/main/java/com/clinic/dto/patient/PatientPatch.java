package com.clinic.dto.patient;

import com.clinic.dto.validation.IsoDate;
import com.clinic.dto.validation.Patterns;
import com.clinic.entity.enums.Gender;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Sửa hồ sơ: mọi trường đều không bắt buộc (bệnh nhân tự sửa thì không đổi được SĐT). */
public record PatientPatch(
    @Size(min = 2) String fullName,
    @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @IsoDate String dateOfBirth,
    Gender gender,
    @Pattern(regexp = "^\\d{12}$", message = "Số CCCD phải gồm 12 chữ số") String nationalId,
    @Size(max = 255) String address,
    @Size(max = 20) String insuranceNo,
    @IsoDate String insuranceExpiry,
    @Size(max = 500) String allergies,
    @Size(max = 100) String occupation,
    @Size(max = 50) String ethnicity,
    @Size(max = 100) String relativeName,
    @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String relativePhone) {}
