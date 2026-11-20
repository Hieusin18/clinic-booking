package com.clinic.dto.banner;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/**
 * Tạo hoặc sửa banner (gửi đủ các trường).
 *
 * @param kind NOTICE (dải thông báo chữ) hoặc PROMO (ảnh giới thiệu)
 * @param link "/doctor/&lt;id&gt;", "/book/&lt;id&gt;" (mở trong app) hoặc "https://…"; chuỗi rỗng = không có link
 * @param startsAt bắt đầu hiện (null = ngay)
 * @param endsAt hết hiện (null = không hạn)
 */
public record BannerRequest(
    @jakarta.validation.constraints.NotNull(message = "Chọn loại banner") @Pattern(regexp = "NOTICE|PROMO", message = "Loại banner là NOTICE hoặc PROMO") String kind,
    @NotBlank(message = "Nhập tiêu đề") @Size(max = 80, message = "Tiêu đề tối đa 80 ký tự") String title,
    @Size(max = 200, message = "Nội dung tối đa 200 ký tự") String body,
    @Size(max = 300) @Pattern(regexp = "^$|^/(doctor|book)/[A-Za-z0-9-]+$|^https://\\S+$", message = "Link là /doctor/<id>, /book/<id> hoặc https://…") String link,
    Instant startsAt,
    Instant endsAt,
    @Min(0) @Max(999) Integer sortOrder,
    Boolean active) {}
