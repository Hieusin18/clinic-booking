package com.clinic.dto.catalog;

import jakarta.validation.constraints.Size;

/** @param isActive false = ngừng dùng: không hiện khi kê đơn nhưng đơn cũ vẫn giữ */
public record MedicinePatch(@Size(min = 2) String name, String activeIngredient, String strength, String unit, Boolean isActive) {}
