package com.clinic.dto.catalog;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Thêm chuyên khoa (sửa thì mọi trường đều không bắt buộc, xem SpecialtyPatch). */
public record SpecialtyRequest(@NotNull @Size(min = 2) String name, String description,
    /** Triệu chứng thường gặp để gợi ý khoa (tối đa 40 mục) */
    @Size(max = 40) List<@Size(max = 60) String> symptoms) {}
