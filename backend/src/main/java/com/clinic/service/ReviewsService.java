package com.clinic.service;

import com.clinic.dto.PageQuery;
import com.clinic.dto.review.HideRequest;
import com.clinic.dto.review.ReviewRequest;
import com.clinic.entity.Review;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.repository.ReviewRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.ContentFilter;
import com.clinic.view.Json;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Bệnh nhân đánh giá lượt khám; hồ sơ bác sĩ hiện điểm trung bình và góp ý; admin ẩn góp ý không phù hợp. */
@Service
public class ReviewsService {
  private static final Logger log = LoggerFactory.getLogger(ReviewsService.class);
  /** Được đánh giá / sửa đánh giá trong 30 ngày kể từ khi khám xong */
  public static final Duration WINDOW = Duration.ofDays(30);
  public static final String INAPPROPRIATE = "Góp ý có từ ngữ không phù hợp. Vui lòng sửa lại lời lẽ trước khi gửi.";

  private final ReviewRepository reviews;
  private final VisitRepository visits;
  private final PatientScope scope;

  public ReviewsService(ReviewRepository reviews, VisitRepository visits, PatientScope scope) {
    this.reviews = reviews;
    this.visits = visits;
    this.scope = scope;
  }

  /** Lượt khám của bệnh nhân đang đăng nhập (hồ sơ chưa xác minh chỉ thấy lượt từ lúc gắn tài khoản). */
  private Visit ownVisit(AuthUser user, String visitId) {
    PatientScope.Scope s = scope.scopeOf(user);
    return visits.findById(visitId)
        .filter(v -> v.getPatientId().equals(s.patientId()) && (s.lockedBefore() == null || !v.getCreatedAt().isBefore(s.lockedBefore())))
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy phiếu khám"));
  }

  private static Instant deadline(Visit v) {
    Instant done = v.getCompletedAt() != null ? v.getCompletedAt() : v.getCreatedAt();
    return done.plus(WINDOW);
  }

  /** "Nguyễn Thị Mai" → "Nguyễn T. M." để góp ý công khai không lộ tên đầy đủ */
  public static String maskName(String fullName) {
    String[] parts = fullName == null ? new String[0] : fullName.trim().split("\\s+");
    if (parts.length == 0 || parts[0].isEmpty()) return "Bệnh nhân";
    if (parts.length == 1) return parts[0].charAt(0) + ".";
    StringBuilder sb = new StringBuilder(parts[0]);
    for (int i = 1; i < parts.length; i++) sb.append(' ').append(parts[i].charAt(0)).append('.');
    return sb.toString();
  }

  private static Map<String, Object> mine(Review r) {
    return Json.obj("id", r.getId(), "rating", r.getRating(), "comment", r.getComment(), "hidden", r.isHidden(), "createdAt", r.getCreatedAt(),
        "updatedAt", r.getUpdatedAt());
  }

  /** Đánh giá của bệnh nhân cho lượt khám và còn được gửi/sửa không. */
  @Transactional(readOnly = true)
  public Map<String, Object> forVisit(AuthUser user, String visitId) {
    Visit v = ownVisit(user, visitId);
    Instant until = deadline(v);
    boolean open = v.getStatus() == VisitStatus.DONE && Instant.now().isBefore(until);
    return Json.obj("review", reviews.findByVisitId(visitId).map(ReviewsService::mine).orElse(null), "canReview", open,
        "reviewableUntil", v.getStatus() == VisitStatus.DONE ? until : null);
  }

  /** Gửi hoặc sửa đánh giá: chỉ lượt đã khám xong, trong 30 ngày; góp ý có từ ngữ không phù hợp thì từ chối. */
  @Transactional
  public Map<String, Object> submit(AuthUser user, String visitId, ReviewRequest dto) {
    Visit v = ownVisit(user, visitId);
    if (v.getStatus() != VisitStatus.DONE) throw ApiException.conflict("Chỉ đánh giá được sau khi đã khám xong");
    if (!Instant.now().isBefore(deadline(v))) throw ApiException.conflict("Đã quá 30 ngày kể từ lần khám, không đánh giá được nữa");
    String comment = dto.comment() == null ? null : dto.comment().strip().replaceAll("\\s{3,}", "  ");
    if (comment != null && comment.isEmpty()) comment = null;
    Optional<String> bad = ContentFilter.findInappropriate(comment);
    if (bad.isPresent()) {
      log.info("Chặn góp ý không phù hợp cho lượt khám {} (khớp \"{}\")", visitId, bad.get());
      throw ApiException.badRequestWithCode("INAPPROPRIATE_COMMENT", INAPPROPRIATE);
    }
    Review r = reviews.findByVisitId(visitId).orElseGet(() -> {
      Review n = new Review();
      n.setVisitId(visitId);
      n.setPatientId(v.getPatientId());
      n.setDoctorId(v.getDoctorId());
      return n;
    });
    // Admin đã ẩn thì bệnh nhân sửa lại cũng vẫn ẩn, chờ admin xem lại
    r.setRating(dto.rating());
    r.setComment(comment);
    return mine(reviews.saveAndFlush(r));
  }

  /** {average, count, distribution: {"5": n, …}} của bác sĩ; average null khi chưa có đánh giá. */
  @Transactional(readOnly = true)
  public Map<String, Object> summary(String doctorId) {
    Map<String, Object> dist = new LinkedHashMap<>();
    for (int i = 5; i >= 1; i--) dist.put(String.valueOf(i), 0L);
    long count = 0;
    long sum = 0;
    for (Object[] row : reviews.distribution(doctorId)) {
      int stars = ((Number) row[0]).intValue();
      long n = ((Number) row[1]).longValue();
      dist.put(String.valueOf(stars), n);
      count += n;
      sum += stars * n;
    }
    BigDecimal avg = count == 0 ? null : BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(count), 1, RoundingMode.HALF_UP);
    return Json.obj("average", avg, "count", count, "distribution", dist);
  }

  /** Góp ý công khai của bác sĩ (tên bệnh nhân rút gọn), kèm tổng hợp sao. */
  @Transactional(readOnly = true)
  public Map<String, Object> publicReviews(String doctorId, PageQuery q) {
    Page<Review> page = reviews.publicComments(doctorId, PageRequest.of(q.pageOrDefault() - 1, q.sizeOrDefault()));
    List<Map<String, Object>> items = page.getContent().stream()
        .map(r -> Json.obj("id", r.getId(), "rating", r.getRating(), "comment", r.getComment(), "createdAt", r.getCreatedAt(),
            "patientName", maskName(r.getPatient().getFullName())))
        .toList();
    Map<String, Object> out = q.toPage(items, page.getTotalElements());
    out.put("summary", summary(doctorId));
    return out;
  }

  /** Admin xem mọi đánh giá (tên đầy đủ) để kiểm duyệt. */
  @Transactional(readOnly = true)
  public Map<String, Object> adminList(PageQuery q, String doctorId, Boolean hidden, Integer maxRating) {
    Page<Review> page = reviews.search(doctorId == null ? "" : doctorId, hidden, maxRating == null ? 5 : maxRating,
        PageRequest.of(q.pageOrDefault() - 1, q.sizeOrDefault()));
    List<Map<String, Object>> items = page.getContent().stream().map(r -> {
      Map<String, Object> m = mine(r);
      m.put("visitId", r.getVisitId());
      m.put("hiddenReason", r.getHiddenReason());
      m.put("patient", Json.obj("id", r.getPatientId(), "fullName", r.getPatient().getFullName()));
      m.put("doctor", Json.obj("id", r.getDoctorId(), "title", r.getDoctor().getTitle(), "user", Json.obj("fullName", r.getDoctor().getUser().getFullName())));
      return m;
    }).toList();
    return q.toPage(items, page.getTotalElements());
  }

  @Transactional
  public Map<String, Object> hide(AuthUser admin, String id, HideRequest dto) {
    Review r = reviews.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy đánh giá"));
    r.setHidden(dto.hidden());
    String reason = dto.reason() == null ? null : dto.reason().strip();
    r.setHiddenReason(dto.hidden() && reason != null && !reason.isEmpty() ? reason : null);
    r.setHiddenById(dto.hidden() ? admin.sub() : null);
    Map<String, Object> m = mine(reviews.saveAndFlush(r));
    m.put("hiddenReason", r.getHiddenReason());
    return m;
  }
}
