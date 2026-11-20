package com.clinic.dto.vitals;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** Sinh hiệu (cùng giới hạn với bệnh án); ô nào chưa đo để trống. */
public record VitalsRequest(
    @Min(20) @Max(250) Integer pulse,
    @DecimalMin("30") @DecimalMax("45") @Digits(integer = 3, fraction = 1) Double temperature,
    @Min(40) @Max(300) Integer bpSystolic,
    @Min(20) @Max(200) Integer bpDiastolic,
    @Min(5) @Max(80) Integer respiratoryRate,
    @Min(50) @Max(100) Integer spo2,
    @DecimalMin("0.5") @DecimalMax("400") @Digits(integer = 3, fraction = 1) Double weight,
    @DecimalMin("30") @DecimalMax("250") @Digits(integer = 3, fraction = 1) Double height,
    @Size(max = 300) String note) {}
