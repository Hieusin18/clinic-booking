package com.clinic.exception;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Path;
import java.lang.annotation.Annotation;
import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Câu báo lỗi dữ liệu gửi lên, cùng cách viết với class-validator của bản NestJS cũ ("practiceSince must not be greater
 * than 2100") để web và app hiển thị như trước. Câu tự đặt bằng tiếng Việt (message = "...") giữ nguyên.
 */
public final class ValidationMessages {
  private ValidationMessages() {}

  /** Danh sách câu báo lỗi, xếp theo thứ tự khai báo trường trong DTO (như NestJS). */
  public static List<String> of(Collection<? extends ConstraintViolation<?>> violations) {
    return violations.stream().sorted(Comparator.<ConstraintViolation<?>>comparingInt(ValidationMessages::order)
        .thenComparing(v -> v.getPropertyPath().toString())).map(ValidationMessages::of).toList();
  }

  public static String of(ConstraintViolation<?> v) {
    Annotation a = v.getConstraintDescriptor().getAnnotation();
    if (!isDefaultMessage(a, v.getMessageTemplate())) return v.getMessage();
    Map<String, Object> attrs = v.getConstraintDescriptor().getAttributes();
    Object value = v.getInvalidValue();
    String text = switch (a.annotationType().getSimpleName()) {
      case "NotNull" -> missing(declaredType(v));
      case "Min", "DecimalMin" -> "must not be less than " + attrs.get("value");
      case "Max", "DecimalMax" -> "must not be greater than " + attrs.get("value");
      case "Size" -> size(value, attrs);
      case "Email" -> "must be an email";
      case "Pattern" -> "must match /" + attrs.get("regexp") + "/ regular expression";
      case "Digits" -> "must be a number conforming to the specified constraints";
      case "NotBlank", "NotEmpty" -> "should not be empty";
      case "Uuid" -> "must be a UUID";
      case "IsoDate" -> "must be a valid ISO 8601 date string";
      default -> v.getMessage();
    };
    return field(v.getPropertyPath()) + " " + text;
  }

  /** JSON gửi lên sai kiểu (vd. giới tính không thuộc danh sách); null nếu không phải lỗi kiểu dữ liệu của một trường. */
  public static String unreadable(Throwable e) {
    for (Throwable t = e; t != null; t = t.getCause()) {
      if (t instanceof InvalidFormatException f && !f.getPath().isEmpty()) {
        String name = f.getPath().stream().map(r -> r.getFieldName() != null ? r.getFieldName() : String.valueOf(r.getIndex()))
            .collect(Collectors.joining("."));
        return name + " " + missing(f.getTargetType());
      }
      if (t instanceof JsonMappingException m && t.getCause() == null) break;
    }
    return null;
  }

  private static boolean isDefaultMessage(Annotation a, String template) {
    if (template.startsWith("{")) return true;
    try {
      return template.equals(a.annotationType().getMethod("message").getDefaultValue());
    } catch (NoSuchMethodException e) {
      return false;
    }
  }

  /** Câu khi thiếu trường hoặc sai kiểu, theo kiểu dữ liệu của trường. */
  static String missing(Class<?> type) {
    if (type == null) return "should not be null or undefined";
    if (type.isEnum()) {
      return "must be one of the following values: " + Arrays.stream(type.getEnumConstants()).map(String::valueOf).collect(Collectors.joining(", "));
    }
    if (type == String.class) return "must be a string";
    if (type == Integer.class || type == int.class || type == Long.class || type == long.class) return "must be an integer number";
    if (Number.class.isAssignableFrom(type) || type == double.class || type == float.class || type == BigDecimal.class) {
      return "must be a number conforming to the specified constraints";
    }
    if (type == Boolean.class || type == boolean.class) return "must be a boolean value";
    if (Collection.class.isAssignableFrom(type)) return "must be an array";
    return "should not be null or undefined";
  }

  private static String size(Object value, Map<String, Object> attrs) {
    int min = (int) attrs.get("min");
    int max = (int) attrs.get("max");
    if (value instanceof Collection<?> c) {
      return c.size() < min ? "must contain at least " + min + " elements" : "must contain no more than " + max + " elements";
    }
    int length = value == null ? 0 : value.toString().length();
    return length < min ? "must be longer than or equal to " + min + " characters" : "must be shorter than or equal to " + max + " characters";
  }

  /** Tên trường như class-validator: "items.0.quantity". */
  static String field(Path path) {
    StringBuilder sb = new StringBuilder();
    for (Path.Node n : path) {
      if (n.getIndex() != null) sb.append('.').append(n.getIndex());
      if (n.getName() != null && !n.getName().startsWith("<")) sb.append('.').append(n.getName());
    }
    return sb.length() > 0 ? sb.substring(1) : "";
  }

  /** Kiểu khai báo của trường bị lỗi (để biết nên báo "must be a string" hay "must be an integer number"). */
  private static Class<?> declaredType(ConstraintViolation<?> v) {
    Object leaf = v.getLeafBean();
    String name = null;
    for (Path.Node n : v.getPropertyPath()) name = n.getName();
    if (leaf == null || name == null) return null;
    RecordComponent[] components = leaf.getClass().getRecordComponents();
    if (components != null) {
      for (RecordComponent rc : components) if (rc.getName().equals(name)) return rc.getType();
    }
    try {
      return leaf.getClass().getDeclaredField(name).getType();
    } catch (NoSuchFieldException e) {
      return null;
    }
  }

  /** Vị trí khai báo của trường (cấp ngoài cùng) trong DTO. */
  private static int order(ConstraintViolation<?> v) {
    String top = null;
    for (Path.Node n : v.getPropertyPath()) {
      top = n.getName();
      break;
    }
    RecordComponent[] components = v.getRootBeanClass().getRecordComponents();
    if (components == null || top == null) return Integer.MAX_VALUE;
    for (int i = 0; i < components.length; i++) if (components[i].getName().equals(top)) return i;
    return Integer.MAX_VALUE;
  }
}
