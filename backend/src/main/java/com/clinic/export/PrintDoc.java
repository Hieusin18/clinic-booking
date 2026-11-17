package com.clinic.export;

import java.util.List;

/**
 * "Mô hình in" dùng chung cho PDF, Word và HTML để nội dung các bản luôn giống nhau.
 *
 * @param footer dòng chân trang (thời điểm xuất, mã tra cứu)
 * @param fileName tên tệp tải về (không có phần mở rộng)
 */
public record PrintDoc(List<Page> pages, String footer, String fileName) {

  /** Một ô "nhãn: giá trị". Giá trị rỗng in thành dòng chấm như mẫu giấy. */
  public record Field(String label, String value, boolean bold) {
    public Field(String label, String value) {
      this(label, value, false);
    }

    /** Giá trị để in (rỗng thì dòng chấm). */
    public String shown() {
      String v = value == null ? "" : value.trim();
      return v.isEmpty() ? PrintDocBuilder.BLANK : v;
    }
  }

  /** Một khối nội dung của trang. */
  public sealed interface Block permits Heading, Fields, Text, Grid, Medicine, Image {}

  public record Heading(String text) implements Block {}

  /** Nhiều ô cùng một dòng. */
  public record Fields(List<Field> fields) implements Block {
    public static Fields of(Field... f) {
      return new Fields(List.of(f));
    }
  }

  public record Text(String text, boolean italic, boolean bold, boolean indent) implements Block {}

  /** Bảng dấu hiệu sinh tồn. */
  public record Grid(List<Field> cells, int columns) implements Block {}

  public record Medicine(int index, String name, String quantity, String usage) implements Block {}

  /** Ảnh kết quả cận lâm sàng; width/height là kích thước gốc (điểm ảnh). */
  public record Image(byte[] data, String mimeType, int width, int height, String caption) implements Block {
    @Override
    public boolean equals(Object o) {
      return o instanceof Image x && java.util.Arrays.equals(data, x.data) && java.util.Objects.equals(mimeType, x.mimeType) && java.util.Objects.equals(width, x.width) && java.util.Objects.equals(height, x.height) && java.util.Objects.equals(caption, x.caption);
    }

    @Override
    public int hashCode() {
      return 31 * java.util.Arrays.hashCode(data) + java.util.Objects.hashCode(mimeType) + java.util.Objects.hashCode(width) + java.util.Objects.hashCode(height) + java.util.Objects.hashCode(caption);
    }

    @Override
    public String toString() {
      return "Image[" + (data == null ? 0 : data.length) + " bytes" + ", " + mimeType + ", " + width + ", " + height + ", " + caption + "]";
    }
  }

  /** Chữ ký cuối trang. */
  public record Sign(String date, String role, String name) {}

  /** Một trang (bệnh án, phiếu kết quả, đơn thuốc). note = ghi chú cuối trang nội dung. */
  public record Page(List<String> headerLeft, List<String> headerRight, String title, String subtitle, List<Block> blocks, Sign sign, String note) {}
}
