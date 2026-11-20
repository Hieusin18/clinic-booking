package com.clinic.util;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Lọc từ ngữ không phù hợp trong góp ý của bệnh nhân (tiếng Việt và tiếng Anh thông dụng).
 *
 * <p>Xử lý các cách viết lách bộ lọc hay gặp: viết không dấu, chèn ký tự giữa các chữ ("đ.m", "v c l"), thay chữ bằng
 * số/ký hiệu ("l0n", "d!t"), kéo dài chữ ("đmmm"). Từ nào bỏ dấu thì trùng từ thường (cặc/các, lồn/lon, đéo/đeo, đĩ/đi)
 * chỉ chặn khi viết có dấu. Bộ lọc không bắt hết được; admin vẫn ẩn được góp ý lọt qua.
 */
public final class ContentFilter {
  private ContentFilter() {}

  /** Từ/cụm từ chặn khi viết có dấu */
  static final List<String> ACCENTED = List.of("lồn", "cặc", "buồi", "đéo", "đĩ", "điếm", "đụ", "địt", "óc chó", "đồ chó", "thằng chó",
      "chó má", "mất dạy", "khốn nạn", "súc vật", "đồ ngu", "thằng ngu", "con ngu", "ngu như bò", "ngu như chó", "mẹ mày", "bố mày",
      "cút mẹ", "vãi lồn", "đù má", "đù mẹ", "đồ điên", "thằng điên", "con điên");

  /** Từ viết tắt, tiếng lóng, tiếng Anh: so sau khi bỏ dấu */
  static final Set<String> PLAIN_WORDS = Set.of("dm", "dmm", "dcm", "dkm", "dmcs", "dcmm", "dmvl", "vcl", "vkl", "vcc", "vl", "clm", "cmm", "cmn",
      "ditme", "ditmemay", "dume", "duma", "dumamay", "occho", "matday", "khonnan", "sucvat", "fuck", "fucking", "fck", "fuk", "shit",
      "bitch", "cunt", "dick", "asshole", "motherfucker", "bastard");

  /** Cụm từ viết không dấu */
  /** Cụm từ viết không dấu (chỉ những cụm bỏ dấu không trùng câu bình thường; "con cac" = "con các", "du me" = "dù mẹ"…) */
  static final List<String> PLAIN_PHRASES = List.of("dit me", "dit con me", "dit cu", "oc cho", "mat day", "khon nan", "suc vat", "thang cho",
      "thang ngu", "ngu nhu bo", "ngu nhu cho");

  private static final Pattern MARKS = Pattern.compile("\\p{M}+");
  /** Ký tự thay chữ, chỉ tính khi đứng sát chữ cái ("l0n", "d!t") */
  private static final Pattern LEET = Pattern.compile("(?<=\\p{L})[0134578@$!*]|[0134578@$!*](?=\\p{L})");

  /** Bỏ dấu tiếng Việt: "Đéo" → "deo" */
  public static String stripMarks(String s) {
    String n = Normalizer.normalize(s.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD);
    return MARKS.matcher(n).replaceAll("");
  }

  private static String leet(String s) {
    StringBuilder out = new StringBuilder();
    var m = LEET.matcher(s);
    int last = 0;
    while (m.find()) {
      out.append(s, last, m.start());
      out.append(switch (s.charAt(m.start())) {
        case '0' -> "o";
        case '1', '!' -> "i";
        case '3' -> "e";
        case '4', '@' -> "a";
        case '5', '$' -> "s";
        case '7' -> "t";
        case '8' -> "b";
        default -> ""; // '*' che chữ: bỏ đi
      });
      last = m.end();
    }
    return out.append(s.substring(last)).toString();
  }

  /** Tách từ theo chữ cái; nối các chữ cái đứng lẻ liền nhau ("v c l", "đ.m") thành một từ. */
  static List<String> tokens(String s) {
    List<String> raw = new ArrayList<>();
    for (String t : s.split("[^\\p{L}]+")) if (!t.isEmpty()) raw.add(t);
    List<String> out = new ArrayList<>(raw);
    StringBuilder run = new StringBuilder();
    for (String t : raw) {
      if (t.length() == 1) {
        run.append(t);
        continue;
      }
      if (run.length() > 1) out.add(run.toString());
      run.setLength(0);
    }
    if (run.length() > 1) out.add(run.toString());
    return out;
  }

  /** "đmmm" → "đm", "ditttt" → "dit" */
  static String collapse(String t) {
    return t.replaceAll("(\\p{L})\\1+", "$1");
  }

  private static boolean hasPhrase(List<String> tokens, String phrase) {
    return (" " + String.join(" ", tokens) + " ").contains(" " + phrase + " ");
  }

  /** Từ/cụm từ không phù hợp đầu tiên tìm thấy (để ghi log, không đưa lại cho người dùng); rỗng = sạch. */
  public static Optional<String> findInappropriate(String text) {
    if (text == null || text.isBlank()) return Optional.empty();
    String lower = leet(text.toLowerCase(Locale.forLanguageTag("vi")));
    List<String> accented = tokens(Normalizer.normalize(lower, Normalizer.Form.NFC));
    List<String> accentedCollapsed = accented.stream().map(ContentFilter::collapse).toList();
    for (String w : ACCENTED) {
      if (hasPhrase(accented, w) || hasPhrase(accentedCollapsed, w)) return Optional.of(w);
    }
    // Cố ý thay chữ bằng số/ký hiệu ("l0n", "đ!t") thì từ bỏ dấu dù trùng từ thường cũng tính là chửi
    String original = text.toLowerCase(Locale.forLanguageTag("vi"));
    for (String t : original.split("[^\\p{L}0134578@$!*]+")) {
      if (t.isEmpty() || !LEET.matcher(t).find()) continue;
      String w = collapse(stripMarks(leet(t)));
      for (String a : ACCENTED) if (!a.contains(" ") && stripMarks(a).equals(w)) return Optional.of(a);
    }
    List<String> plain = tokens(stripMarks(lower));
    List<String> plainCollapsed = plain.stream().map(ContentFilter::collapse).toList();
    for (List<String> list : List.of(plain, plainCollapsed)) {
      for (String t : list) if (PLAIN_WORDS.contains(t)) return Optional.of(t);
      for (String p : PLAIN_PHRASES) if (hasPhrase(list, p)) return Optional.of(p);
    }
    return Optional.empty();
  }

  public static boolean isInappropriate(String text) {
    return findInappropriate(text).isPresent();
  }
}
