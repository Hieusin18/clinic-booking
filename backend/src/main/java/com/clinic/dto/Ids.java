package com.clinic.dto;

import com.clinic.dto.validation.Uuid;
import com.clinic.exception.ApiException;

/** Kiểm tra id trên đường dẫn (giống ParseUUIDPipe của bản cũ). */
public final class Ids {
  private Ids() {}

  public static String uuid(String id) {
    if (id == null || !Uuid.Validator.valid(id)) throw ApiException.badRequest("Validation failed (uuid is expected)");
    return id;
  }
}
