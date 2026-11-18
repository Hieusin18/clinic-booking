package com.clinic.dto.auth;

import com.clinic.dto.validation.Patterns;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record LoginRequest(
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @NotNull String password) {}
