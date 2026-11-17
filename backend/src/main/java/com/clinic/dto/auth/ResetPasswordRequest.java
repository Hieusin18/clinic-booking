package com.clinic.dto.auth;

import com.clinic.dto.validation.Uuid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Quên mật khẩu: dùng phiên xác minh số điện thoại (mục đích RESET_PASSWORD) để đặt mật khẩu mới */
public record ResetPasswordRequest(
    @NotNull @Uuid String verificationId,
    @NotNull @Size(max = 100) String ticket,
    @NotNull @Size(max = 72) String newPassword) {}
