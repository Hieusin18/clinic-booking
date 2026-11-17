package com.clinic.dto.catalog;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * @param strength hàm lượng, ví dụ "500mg"
 * @param unit đơn vị bán: viên, vỉ, chai, tuýp…
 */
public record MedicineRequest(@NotNull @Size(min = 2) String name, String activeIngredient, String strength, @NotNull String unit) {}
