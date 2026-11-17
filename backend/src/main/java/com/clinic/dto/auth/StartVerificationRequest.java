package com.clinic.dto.auth;

import com.clinic.dto.validation.Patterns;
import com.clinic.entity.enums.PhoneVerifyPurpose;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record StartVerificationRequest(
    @NotNull(message = Patterns.PHONE_MESSAGE) @Pattern(regexp = Patterns.PHONE, message = Patterns.PHONE_MESSAGE) String phone,
    @NotNull PhoneVerifyPurpose purpose) {}
