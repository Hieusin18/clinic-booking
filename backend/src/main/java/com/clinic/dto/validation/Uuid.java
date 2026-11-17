package com.clinic.dto.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.regex.Pattern;

/** Chuỗi UUID; null được bỏ qua. */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = Uuid.Validator.class)
public @interface Uuid {
  String message() default "phải là UUID";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};

  /** Kiểm tra UUID. */
  class Validator implements ConstraintValidator<Uuid, String> {
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext ctx) {
      return value == null || valid(value);
    }

    public static boolean valid(String value) {
      return UUID.matcher(value).matches();
    }
  }
}
