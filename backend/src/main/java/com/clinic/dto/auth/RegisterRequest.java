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
 * @param nationalId số CCCD 12 chữ số (bắt buộc: lễ tân tra đúng người)
 * @param relativeName họ tên người thân để liên hệ khi cần (bắt buộc)
 * @param relativePhone số điện thoại người thân (bắt buộc)
 * @param verificationId phiên xác minh số điện thoại đã xong (POST /auth/phone-verifications), bắt buộc trừ khi
 *     REQUIRE_PHONE_VERIFICATION=false
 */
public record RegisterRequest(
    @NotNull @Size(min = 2) String fullName,
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @NotNull @Size(max = 72) String password,
    @NotNull @IsoDate String dateOfBirth,
    @NotNull Gender gender,
    @NotNull(message = "Nhập số CCCD") @Pattern(regexp = "^\\d{12}$", message = "Số CCCD gồm 12 chữ số") String nationalId,
    @NotNull(message = "Nhập họ tên người thân") @Size(min = 2, max = 100, message = "Nhập họ tên người thân") String relativeName,
    @NotNull(message = "Nhập số điện thoại người thân") @Pattern(regexp = Patterns.PHONE, message = "Số điện thoại người thân gồm 10 chữ số, bắt đầu bằng 0") String relativePhone,
    @Email String email,
    @Uuid String verificationId,
    @Size(max = 100) String ticket) {}
