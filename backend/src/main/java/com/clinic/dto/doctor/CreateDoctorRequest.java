package com.clinic.dto.doctor;

import com.clinic.dto.validation.Patterns;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * @param password mật khẩu ban đầu: cùng quy tắc với mật khẩu người dùng tự đặt
 * @param title học hàm, học vị: "ThS.BS", "BSCKII"…
 * @param room phòng khám, ví dụ "Phòng 2"
 */
public record CreateDoctorRequest(
    @NotNull @Size(min = 2) String fullName,
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @Email String email,
    @NotNull @Size(max = 72) String password,
    @NotNull String specialtyId,
    String title,
    @Size(max = 2000) String bio,
    @Size(max = 40) String room) {}
