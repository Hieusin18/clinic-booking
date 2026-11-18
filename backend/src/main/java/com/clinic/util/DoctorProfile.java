package com.clinic.util;

import com.clinic.exception.ApiException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.function.ToIntFunction;

/** Hàm phụ cho hồ sơ bác sĩ: thế mạnh, số năm kinh nghiệm, kiểm tra năm, nhận diện ảnh. */
public final class DoctorProfile {
  public static final int AVATAR_MAX_BYTES = 2 * 1024 * 1024;

  private DoctorProfile() {}

  /** Một mốc trong quá trình đào tạo hoặc công tác. {@code toYear} null = đến nay. */
  public interface Entry {
    Integer fromYear();

    Integer toYear();

    String title();
  }

  /** Năm hiện tại theo giờ Việt Nam. */
  public static int currentYear(Instant now) {
    return VnTime.date(now).getYear();
  }

  /** Thế mạnh lưu mỗi dòng một mục; API trả và nhận dạng mảng. */
  public static List<String> splitExpertise(String s) {
    if (s == null) return List.of();
    return Arrays.stream(s.split("\n")).filter(x -> !x.isEmpty()).toList();
  }

  public static String joinExpertise(List<String> items) {
    LinkedHashSet<String> clean = new LinkedHashSet<>();
    for (String i : items) {
      String t = i.trim();
      if (!t.isEmpty()) clean.add(t);
    }
    return clean.isEmpty() ? null : String.join("\n", clean);
  }

  /** Số năm kinh nghiệm tính từ năm bắt đầu hành nghề. */
  public static Integer experienceYears(Integer practiceSince, Instant now) {
    return practiceSince == null ? null : Math.max(0, currentYear(now) - practiceSince);
  }

  /** Kiểm tra năm hợp lệ: không ở tương lai, năm kết thúc không trước năm bắt đầu. */
  public static void checkYears(Integer practiceSince, List<? extends Entry> entries, Instant now) {
    int year = currentYear(now);
    if (practiceSince != null && practiceSince > year) throw ApiException.badRequest("Năm bắt đầu hành nghề không được sau năm hiện tại");
    for (Entry e : entries) {
      if (e.fromYear() > year) throw ApiException.badRequest("\"" + e.title() + "\": năm bắt đầu không được sau năm hiện tại");
      if (e.toYear() != null && e.toYear() < e.fromYear()) throw ApiException.badRequest("\"" + e.title() + "\": năm kết thúc phải từ năm bắt đầu trở đi");
      if (e.toYear() != null && e.toYear() > year) {
        throw ApiException.badRequest("\"" + e.title() + "\": năm kết thúc không được sau năm hiện tại, việc đang làm thì để trống");
      }
    }
  }

  /** Mốc gần nhất trước: việc đang làm ("đến nay") đứng đầu, rồi theo năm kết thúc và năm bắt đầu giảm dần. */
  public static <T> List<T> newestFirst(List<T> entries, ToIntFunction<T> fromYear, java.util.function.Function<T, Integer> toYear) {
    List<T> out = new ArrayList<>(entries);
    Comparator<T> byEnd = Comparator.comparingDouble(e -> toYear.apply(e) == null ? Double.POSITIVE_INFINITY : toYear.apply(e));
    out.sort(byEnd.reversed().thenComparing(Comparator.comparingInt(fromYear).reversed()));
    return out;
  }

  /** Nhận diện ảnh theo vài byte đầu (không tin phần mở rộng hay Content-Type người gửi khai). */
  public static String detectImage(byte[] b) {
    if (b.length >= 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) return "image/jpeg";
    byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (b.length >= 8 && Arrays.equals(Arrays.copyOf(b, 8), png)) return "image/png";
    if (b.length >= 12 && new String(b, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
        && new String(b, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) {
      return "image/webp";
    }
    return null;
  }
}
