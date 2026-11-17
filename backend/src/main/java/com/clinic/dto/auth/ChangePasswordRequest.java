package com.clinic.dto.auth;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** @param pushToken token thông báo đẩy của máy đang dùng: giữ lại, các máy khác thôi nhận thông báo */
public record ChangePasswordRequest(
    @NotNull @Size(max = 72) String currentPassword,
    @NotNull @Size(max = 72) String newPassword,
    @Size(max = 200) String pushToken) {}
