package com.clinic.dto.catalog;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Thêm chuyên khoa (sửa thì mọi trường đều không bắt buộc, xem SpecialtyPatch). */
public record SpecialtyRequest(@NotNull @Size(min = 2) String name, String description) {}
