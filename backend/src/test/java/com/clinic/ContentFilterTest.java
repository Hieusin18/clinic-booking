package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.service.ReviewsService;
import com.clinic.util.ContentFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("Lọc từ ngữ không phù hợp trong góp ý")
class ContentFilterTest {
  @ParameterizedTest
  @ValueSource(strings = {
      "Bác sĩ khám như cặc", "đéo bao giờ quay lại", "Đ.m chờ cả buổi", "đmmm", "v c l thật", "vcl", "dm phòng khám", "lễ tân mất dạy",
      "đồ óc chó", "dit me", "l0n", "DIT ME", "đ!t", "fuck this clinic", "f*ck", "ngu như bò", "thằng ngu", "súc vật", "khon nan qua"})
  @DisplayName("chặn: có dấu, không dấu, viết tắt, chèn ký tự, thay số, kéo dài chữ")
  void blocks(String text) {
    assertThat(ContentFilter.isInappropriate(text)).as(text).isTrue();
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "Các bác sĩ rất tận tình", "Mua một lon nước ở căng tin", "Nhớ đeo khẩu trang", "Con các anh chị được khám kỹ", "Dù mẹ tôi lớn tuổi vẫn được ưu tiên",
      "Tôi đi khám lúc 8h", "Chờ hơi lâu, 37 độ mà phòng nóng", "Bị chó cắn được tiêm phòng ngay", "Đỗ chờ xe hơi khó", "Admin hỗ trợ tốt",
      "Ngủ không ngon, độ ngủ sâu kém", "Phòng khám sạch sẽ, 5 sao", ""})
  @DisplayName("không chặn nhầm câu bình thường")
  void allows(String text) {
    assertThat(ContentFilter.isInappropriate(text)).as(text).isFalse();
  }

  @Test
  @DisplayName("rút gọn tên bệnh nhân trên góp ý công khai")
  void maskName() {
    assertThat(ReviewsService.maskName("Nguyễn Thị Mai")).isEqualTo("Nguyễn T. M.");
    assertThat(ReviewsService.maskName("Mai")).isEqualTo("M.");
    assertThat(ReviewsService.maskName("  ")).isEqualTo("Bệnh nhân");
  }
}
