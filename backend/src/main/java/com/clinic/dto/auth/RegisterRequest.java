package com.clinic.dto.auth;

import com.clinic.dto.validation.IsoDate;
import com.clinic.dto.validation.Patterns;
import com.clinic.dto.validation.Uuid;
import com.clinic.entity.enums.Gender;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Bệnh nhân tự đăng ký.
 *
 * @param password độ mạnh kiểm tra ở AuthService (Passwords.problem)
 * @param dateOfBirth ngày sinh, dạng YYYY-MM-DD
 * @param verificationId phiên xác minh số điện thoại đã xong (POST /auth/phone-verifications), bắt buộc trừ khi
 *     REQUIRE_PHONE_VERIFICATION=false
 */
public record RegisterRequest(
    @NotNull @Size(min = 2) String fullName,
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @NotNull @Size(max = 72) String password,
    @NotNull @IsoDate String dateOfBirth,
    @NotNull Gender gender,
    @Email String email,
    @Uuid String verificationId,
    @Size(max = 100) String ticket) {}
