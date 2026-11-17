package com.clinic.exception;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Trùng dữ liệu (vi phạm ràng buộc unique trong CSDL) thì trả 409 kèm câu dễ hiểu, thay vì lỗi 500.
 * Các chỗ đã tự kiểm tra trước vẫn giữ câu riêng; đây bắt các trường hợp còn lại (email trùng, CCCD trùng…)
 * và cả khi hai yêu cầu cùng lúc vượt qua bước kiểm tra.
 */
public final class UniqueMessages {
  private static final Map<String, String> MESSAGES = Map.of(
      "email", "Email đã được dùng cho tài khoản khác",
      "phone", "Số điện thoại đã được dùng",
      "nationalId", "Số CCCD đã có trong hồ sơ khác",
      "name", "Tên đã tồn tại");

  /** Tên ràng buộc mặc định của migration cũ: "Bảng_cột_key" (unique nhiều cột: "Bảng_cột1_cột2_key"). */
  private static final Pattern KEY = Pattern.compile("\"?([A-Za-z]+)_([A-Za-z0-9_]+)_key\"?");

  private UniqueMessages() {}

  public static String message(List<String> fields) {
    for (String f : fields) {
      if (MESSAGES.containsKey(f)) return MESSAGES.get(f);
    }
    return "Dữ liệu bị trùng với bản ghi đã có";
  }

  /** Lấy tên các cột từ thông báo lỗi PostgreSQL (duplicate key value violates unique constraint "User_email_key"). */
  public static List<String> fieldsFromError(String error) {
    if (error == null) return List.of();
    Matcher m = KEY.matcher(error);
    if (m.find()) return new ArrayList<>(Arrays.asList(m.group(2).split("_")));
    return List.of();
  }
}
