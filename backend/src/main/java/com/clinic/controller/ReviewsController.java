package com.clinic.controller;

import com.clinic.dto.PageQuery;
import com.clinic.dto.review.HideRequest;
import com.clinic.dto.review.ReviewRequest;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Public;
import com.clinic.security.Roles;
import com.clinic.service.ReviewsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Đánh giá sau khi khám. */
@Tag(name = "reviews")
@RestController
public class ReviewsController {
  private final ReviewsService service;

  public ReviewsController(ReviewsService service) {
    this.service = service;
  }

  /** Bệnh nhân: đánh giá của mình cho lượt khám, còn đánh giá được không */
  @Roles(Role.PATIENT)
  @GetMapping("/visits/{id}/review")
  public Map<String, Object> mine(@CurrentUser AuthUser user, @PathVariable String id) {
    return service.forVisit(user, id);
  }

  /** Bệnh nhân gửi hoặc sửa đánh giá (trong 30 ngày sau khi khám xong) */
  @Roles(Role.PATIENT)
  @PutMapping("/visits/{id}/review")
  public Map<String, Object> submit(@CurrentUser AuthUser user, @PathVariable String id, @Valid @RequestBody ReviewRequest dto) {
    return service.submit(user, id, dto);
  }

  /** Công khai: điểm trung bình, phân bố sao và góp ý của bác sĩ */
  @Public
  @GetMapping("/doctors/{id}/reviews")
  public Map<String, Object> doctorReviews(@PathVariable String id, @Valid PageQuery q) {
    return service.publicReviews(id, q);
  }

  /** Admin kiểm duyệt: hidden=true|false lọc đã ẩn; maxRating lọc đánh giá thấp */
  @Roles(Role.ADMIN)
  @GetMapping("/admin/reviews")
  public Map<String, Object> adminList(@Valid PageQuery q, @RequestParam(required = false) String doctorId,
      @RequestParam(required = false) String hidden, @RequestParam(required = false) String maxRating) {
    Boolean h = hidden == null ? null : switch (hidden) {
      case "true" -> true;
      case "false" -> false;
      default -> throw new ValidationException("hidden must be a boolean value");
    };
    Integer max = null;
    if (maxRating != null) {
      try {
        max = Integer.parseInt(maxRating);
      } catch (NumberFormatException e) {
        throw new ValidationException("maxRating must be an integer number");
      }
      if (max < 1 || max > 5) throw new ValidationException("maxRating must not be less than 1 and not greater than 5");
    }
    return service.adminList(q, doctorId, h, max);
  }

  @Roles(Role.ADMIN)
  @PatchMapping("/admin/reviews/{id}")
  public Map<String, Object> hide(@CurrentUser AuthUser user, @PathVariable String id, @Valid @RequestBody HideRequest dto) {
    return service.hide(user, id, dto);
  }
}
