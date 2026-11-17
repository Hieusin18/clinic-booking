package com.clinic.dto.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

/** Chuỗi ngày dạng ISO 8601 ("2026-11-07" hoặc "2026-11-07T08:00:00Z"); null được bỏ qua. */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = IsoDate.Validator.class)
public @interface IsoDate {
  String message() default "phải là ngày hợp lệ dạng YYYY-MM-DD";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};

  /** Kiểm tra chuỗi ngày. */
  class Validator implements ConstraintValidator<IsoDate, String> {
    @Override
    public boolean isValid(String value, ConstraintValidatorContext ctx) {
      if (value == null) return true;
      return valid(value);
    }

    public static boolean valid(String value) {
      try {
        if (value.length() == 10) {
          LocalDate.parse(value);
        } else {
          OffsetDateTime.parse(value);
        }
        return true;
      } catch (DateTimeParseException e) {
        return false;
      }
    }
  }
}
