package com.clinic.dto.catalog;

import jakarta.validation.constraints.Size;

public record SpecialtyPatch(@Size(min = 2) String name, String description) {}
