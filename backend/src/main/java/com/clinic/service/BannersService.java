package com.clinic.service;

import com.clinic.dto.banner.BannerRequest;
import com.clinic.entity.Banner;
import com.clinic.entity.BannerImage;
import com.clinic.exception.ApiException;
import com.clinic.repository.BannerImageRepository;
import com.clinic.repository.BannerRepository;
import com.clinic.util.DoctorProfile;
import com.clinic.view.Json;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Banner trên app bệnh nhân do admin quản lý. */
@Service
public class BannersService {
  /** Ảnh banner tối đa 1 MB (app tải trên mạng di động) */
  public static final int IMAGE_MAX_BYTES = 1024 * 1024;

  private final BannerRepository banners;
  private final BannerImageRepository images;

  public BannersService(BannerRepository banners, BannerImageRepository images) {
    this.banners = banners;
    this.images = images;
  }

  /** Trạng thái để admin xem nhanh: SHOWING, SCHEDULED (chưa tới ngày), EXPIRED, OFF */
  static String state(Banner b, Instant now) {
    if (!b.isActive()) return "OFF";
    if (b.getStartsAt() != null && b.getStartsAt().isAfter(now)) return "SCHEDULED";
    if (b.getEndsAt() != null && !b.getEndsAt().isAfter(now)) return "EXPIRED";
    return "SHOWING";
  }

  private List<Map<String, Object>> views(List<Banner> list, boolean forAdmin) {
    Map<String, Long> version = new HashMap<>();
    if (!list.isEmpty()) {
      for (Object[] row : images.versions(list.stream().map(Banner::getId).toList())) version.put((String) row[0], ((Instant) row[1]).toEpochMilli());
    }
    Instant now = Instant.now();
    return list.stream().map(b -> {
      Map<String, Object> m = Json.obj("id", b.getId(), "kind", b.getKind(), "title", b.getTitle(), "body", b.getBody(), "link", b.getLink(),
          // Ảnh ở GET /banners/:id/image?v=<số này>; null = chưa có ảnh
          "imageVersion", version.get(b.getId()));
      if (forAdmin) {
        m.put("startsAt", b.getStartsAt());
        m.put("endsAt", b.getEndsAt());
        m.put("sortOrder", b.getSortOrder());
        m.put("active", b.isActive());
        m.put("state", state(b, now));
        m.put("updatedAt", b.getUpdatedAt());
      }
      return m;
    }).toList();
  }

  /** Banner đang hiện trên app. Banner ảnh chưa có ảnh thì chưa hiện. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> showing() {
    return views(banners.showing(Instant.now()), false).stream().filter(m -> "NOTICE".equals(m.get("kind")) || m.get("imageVersion") != null).toList();
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> all() {
    return views(banners.allOrdered(), true);
  }

  private Map<String, Object> one(String id) {
    return views(List.of(banners.findById(id).orElseThrow()), true).get(0);
  }

  private static void apply(Banner b, BannerRequest dto) {
    if (dto.startsAt() != null && dto.endsAt() != null && !dto.endsAt().isAfter(dto.startsAt())) {
      throw ApiException.badRequest("Ngày kết thúc phải sau ngày bắt đầu");
    }
    b.setKind(dto.kind());
    b.setTitle(dto.title().strip());
    b.setBody(dto.body() == null || dto.body().isBlank() ? null : dto.body().strip());
    b.setLink(dto.link() == null || dto.link().isBlank() ? null : dto.link().strip());
    b.setStartsAt(dto.startsAt());
    b.setEndsAt(dto.endsAt());
    b.setSortOrder(dto.sortOrder() == null ? 0 : dto.sortOrder());
    b.setActive(dto.active() == null || dto.active());
  }

  @Transactional
  public Map<String, Object> create(BannerRequest dto) {
    Banner b = new Banner();
    apply(b, dto);
    banners.saveAndFlush(b);
    return one(b.getId());
  }

  @Transactional
  public Map<String, Object> update(String id, BannerRequest dto) {
    Banner b = banners.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy banner"));
    apply(b, dto);
    banners.saveAndFlush(b);
    return one(id);
  }

  @Transactional
  public void remove(String id) {
    Banner b = banners.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy banner"));
    banners.delete(b);
  }

  @Transactional
  public Map<String, Object> setImage(String id, byte[] file) {
    if (file == null) throw ApiException.badRequest("Chưa chọn ảnh");
    if (file.length > IMAGE_MAX_BYTES) throw ApiException.badRequest("Ảnh banner tối đa 1 MB");
    String mimeType = DoctorProfile.detectImage(file);
    if (mimeType == null) throw ApiException.badRequest("Ảnh phải là JPG, PNG hoặc WebP");
    if (!banners.existsById(id)) throw ApiException.notFound("Không tìm thấy banner");
    BannerImage i = images.findById(id).orElseGet(BannerImage::new);
    i.setBannerId(id);
    i.setData(file);
    i.setMimeType(mimeType);
    i.setUpdatedAt(Instant.now());
    images.saveAndFlush(i);
    return one(id);
  }

  public record Image(byte[] data, String mimeType) {
    @Override
    public boolean equals(Object o) {
      return o instanceof Image x && java.util.Arrays.equals(data, x.data) && java.util.Objects.equals(mimeType, x.mimeType);
    }

    @Override
    public int hashCode() {
      return 31 * java.util.Arrays.hashCode(data) + java.util.Objects.hashCode(mimeType);
    }

    @Override
    public String toString() {
      return "Image[" + (data == null ? 0 : data.length) + " bytes, " + mimeType + "]";
    }
  }

  @Transactional(readOnly = true)
  public Image image(String id) {
    BannerImage i = images.findById(id).orElseThrow(() -> ApiException.notFound("Banner chưa có ảnh"));
    return new Image(i.getData(), i.getMimeType());
  }
}
