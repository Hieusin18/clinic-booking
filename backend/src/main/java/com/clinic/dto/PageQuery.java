package com.clinic.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

/** Tham số phân trang dùng chung: ?page=1&pageSize=20&q=từ-khóa */
public record PageQuery(@Min(1) Integer page, @Min(1) @Max(100) Integer pageSize, String q) {
  public int pageOrDefault() {
    return page == null ? 1 : page;
  }

  public int sizeOrDefault() {
    return pageSize == null ? 20 : pageSize;
  }

  /** Từ khóa đã bỏ khoảng trắng hai đầu; trống thì null. */
  public String term() {
    if (q == null) return null;
    String t = q.trim();
    return t.isEmpty() ? null : t;
  }

  public PageRequest pageable(Sort sort) {
    return PageRequest.of(pageOrDefault() - 1, sizeOrDefault(), sort);
  }

  /** {items, total, page, pageSize} */
  public Map<String, Object> toPage(List<?> items, long total) {
    return com.clinic.view.Json.obj("items", items, "total", total, "page", pageOrDefault(), "pageSize", sizeOrDefault());
  }
}
