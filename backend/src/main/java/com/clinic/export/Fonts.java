package com.clinic.export;

import java.nio.file.Files;
import java.nio.file.Path;

/** Font tiếng Việt Tinos (giống Times New Roman) dùng khi xuất PDF, đặt trong thư mục assets/fonts. */
public final class Fonts {
  private Fonts() {}

  /** Thư mục font: biến FONT_DIR, mặc định assets/fonts (cạnh app.jar trong image Docker, thư mục backend khi chạy dev). */
  public static Path dir() {
    String env = System.getenv("FONT_DIR");
    return Path.of(env != null && !env.isBlank() ? env : "assets/fonts");
  }

  public static Path file(String name) {
    return dir().resolve(name);
  }

  /** Thiếu font (vd. Dockerfile quên copy assets/) thì dừng ngay lúc khởi động thay vì lỗi khi bệnh nhân tải file. */
  public static void check() {
    Path regular = file("Tinos-Regular.ttf");
    if (!Files.exists(regular)) throw new IllegalStateException("Không tìm thấy font tại " + regular.toAbsolutePath());
  }
}
