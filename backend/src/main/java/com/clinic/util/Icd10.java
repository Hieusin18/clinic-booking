package com.clinic.util;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Tìm mã ICD-10 theo mã hoặc tên bệnh (không cần gõ dấu). */
public final class Icd10 {
  /** Mã ICD-10: chữ cái + 2 chữ số, có thể thêm phần thập phân 1–2 chữ số (J02, J02.9, M54.16). */
  public static final String ICD_REGEX = "^[A-Z]\\d{2}(\\.\\d{1,2})?$";
  private static final Pattern MARKS = Pattern.compile("[\\u0300-\\u036f]");
  private static final Pattern SPLIT = Pattern.compile("[\\s,()\\[\\]–-]+");

  private record Indexed(Icd10Data.Code code, String code_, String name_, List<String> words) {}

  private static final List<Indexed> INDEX = Icd10Data.ALL.stream()
      .map(c -> new Indexed(c, c.code().toLowerCase(), fold(c.name()), Arrays.asList(SPLIT.split(fold(c.code() + " " + c.name())))))
      .toList();

  private Icd10() {}

  /** Bỏ dấu tiếng Việt để tìm "viem hong" ra "Viêm họng". */
  public static String fold(String s) {
    return MARKS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD)).replaceAll("").replace('đ', 'd').replace('Đ', 'D').toLowerCase();
  }

  /**
   * Tìm theo mã hoặc tên: mỗi từ gõ vào phải là đầu của một từ trong tên/mã ("hong" khớp "họng" nhưng không khớp
   * "không"). Mã khớp đầu và cụm từ liền nhau được xếp lên trước.
   */
  public static List<Map<String, Object>> search(String q, int limit) {
    String text = fold(q == null ? "" : q).trim();
    List<String> terms = Arrays.stream(text.split("\\s+")).filter(t -> !t.isEmpty()).toList();
    return INDEX.stream()
        .filter(e -> terms.stream().allMatch(t -> e.words().stream().anyMatch(w -> w.startsWith(t))))
        .map(e -> Map.entry(e, e.code_().startsWith(text) ? 0 : e.name_().startsWith(text) ? 1 : e.name_().contains(text) ? 2 : 3))
        .sorted(Comparator.comparingInt(Map.Entry::getValue))
        .limit(limit)
        .map(x -> (Map<String, Object>) com.clinic.view.Json.obj("code", x.getKey().code().code(), "name", x.getKey().code().name()))
        .toList();
  }

  public static String name(String code) {
    if (code == null) return null;
    return Icd10Data.ALL.stream().filter(c -> c.code().equals(code)).map(Icd10Data.Code::name).findFirst().orElse(null);
  }
}
