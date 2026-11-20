package com.clinic.dto.review;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Admin ẩn/hiện một đánh giá; reason: lý do ẩn (tùy chọn) */
public record HideRequest(@NotNull Boolean hidden, @Size(max = 200) String reason) {}
