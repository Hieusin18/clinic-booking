package com.clinic.dto.catalog;

import jakarta.validation.constraints.Size;

/** Quên mật khẩu: POST /users/:id/reset-password tạo mật khẩu tạm. */
public record ReceptionistPatch(@Size(min = 2) String fullName, Boolean isActive) {}
