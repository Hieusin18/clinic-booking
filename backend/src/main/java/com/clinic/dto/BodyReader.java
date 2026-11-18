package com.clinic.dto;

import com.clinic.exception.ValidationException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Đọc thân request dạng JSON cho API sửa một phần (PATCH): kiểm tra như DTO bình thường, đồng thời giữ lại
 * thân gốc để biết trường nào được gửi lên (gửi null = xóa giá trị, không gửi = giữ nguyên).
 */
@Component
public class BodyReader {
  private final ObjectMapper mapper;
  private final Validator validator;

  public BodyReader(ObjectMapper mapper, Validator validator) {
    this.mapper = mapper;
    this.validator = validator;
  }

  /** Thân đã kiểm tra kèm danh sách trường có gửi lên. */
  public record Patch<T>(T value, JsonNode raw) {
    public boolean has(String field) {
      return raw != null && raw.has(field);
    }

    /** Có gửi và khác null. */
    public boolean set(String field) {
      return has(field) && !raw.get(field).isNull();
    }
  }

  public <T> Patch<T> read(JsonNode body, Class<T> type) {
    JsonNode raw = body == null || body.isNull() || body.isMissingNode() ? mapper.createObjectNode() : body;
    T value;
    try {
      value = mapper.treeToValue(raw, type);
    } catch (com.fasterxml.jackson.core.JsonProcessingException | IllegalArgumentException e) {
      String field = com.clinic.exception.ValidationMessages.unreadable(e);
      throw new ValidationException(field != null ? field : "Dữ liệu gửi lên không đúng định dạng");
    }
    validate(value);
    return new Patch<>(value, raw);
  }

  public <T> void validate(T value) {
    Set<ConstraintViolation<T>> errors = validator.validate(value);
    if (errors.isEmpty()) return;
    throw new ValidationException(com.clinic.exception.ValidationMessages.of(errors));
  }
}
