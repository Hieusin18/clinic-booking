package com.clinic.dto.catalog;

import jakarta.validation.constraints.Size;
import java.util.List;

public record SpecialtyPatch(@Size(min = 2) String name, String description,
    /** Triệu chứng thường gặp để gợi ý khoa (tối đa 40 mục) */
    @Size(max = 40) List<@Size(max = 60) String> symptoms) {}
