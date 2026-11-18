package com.clinic.exception;

import java.util.List;

/** Lỗi kiểm tra dữ liệu tự viết (ngoài Bean Validation), trả 400 với message là mảng. */
public class ValidationException extends RuntimeException {
  private final transient List<String> messages;

  public ValidationException(List<String> messages) {
    super(String.join("; ", messages));
    this.messages = List.copyOf(messages);
  }

  public ValidationException(String message) {
    this(List.of(message));
  }

  public List<String> getMessages() {
    return messages;
  }
}
