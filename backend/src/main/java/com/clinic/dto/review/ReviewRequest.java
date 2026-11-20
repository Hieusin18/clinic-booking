package com.clinic.dto.review;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * @param rating số sao 1–5
 * @param comment góp ý (tùy chọn), tối đa 500 ký tự
 */
public record ReviewRequest(
    @NotNull(message = "Chọn số sao") @Min(value = 1, message = "Chọn từ 1 đến 5 sao") @Max(value = 5, message = "Chọn từ 1 đến 5 sao") Integer rating,
    @Size(max = 500, message = "Góp ý tối đa 500 ký tự") String comment) {}
