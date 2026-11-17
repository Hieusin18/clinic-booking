package com.clinic.dto.catalog;

import com.clinic.dto.validation.Patterns;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** @param password mật khẩu ban đầu: cùng quy tắc với mật khẩu người dùng tự đặt */
public record ReceptionistRequest(
    @NotNull @Size(min = 2) String fullName,
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @Email String email,
    @NotNull @Size(max = 72) String password) {}
