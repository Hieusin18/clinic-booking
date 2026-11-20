package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.support.Api;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Banner trên app bệnh nhân")
class BannersTest extends IntegrationTest {
  String admin;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
  }

  static Map<String, Object> banner(String kind, String title, Object... extra) {
    Map<String, Object> m = new HashMap<>(Map.of("kind", kind, "title", title));
    for (int i = 0; i < extra.length; i += 2) m.put((String) extra[i], extra[i + 1]);
    return m;
  }

  String create(Map<String, Object> body) {
    return api.post("/api/admin/banners").auth(admin).send(body).expect(201).body().get("id").asText();
  }

  static List<String> titles(JsonNode list) {
    List<String> out = new ArrayList<>();
    list.forEach(b -> out.add(b.get("title").asText()));
    return out;
  }

  @Test
  @DisplayName("app chỉ thấy banner đang hiện: thông báo trước, theo thứ tự; banner ảnh cần có ảnh")
  void showing() {
    Instant now = Instant.now();
    create(banner("PROMO", "Gói khám sức khỏe", "sortOrder", 2, "link", "/doctor/abc"));
    String flu = create(banner("PROMO", "Tiêm phòng cúm", "sortOrder", 1));
    create(banner("NOTICE", "Nghỉ Tết từ 28/1", "body", "Phòng khám nghỉ 28/1–3/2"));
    create(banner("NOTICE", "Đã tắt", "active", false));
    create(banner("NOTICE", "Chưa tới ngày", "startsAt", now.plus(Duration.ofDays(2)).toString()));
    create(banner("NOTICE", "Hết hạn", "endsAt", now.minus(Duration.ofHours(1)).toString()));

    // Banner ảnh chưa có ảnh thì chưa hiện
    assertThat(titles(api.get("/api/banners").expect(200).body())).containsExactly("Nghỉ Tết từ 28/1");

    JsonNode withImage = api.post("/api/admin/banners/" + flu + "/image").auth(admin)
        .files("file", List.of(new Api.FilePart("cum.png", "image/png", DoctorProfileTest.PNG))).expect(200).body();
    assertThat(withImage.get("imageVersion").isNumber()).isTrue();
    assertThat(titles(api.get("/api/banners").expect(200).body())).containsExactly("Nghỉ Tết từ 28/1", "Tiêm phòng cúm");
    var img = api.get("/api/banners/" + flu + "/image").expect(200);
    assertThat(img.header("Content-Type")).isEqualTo("image/png");

    JsonNode all = api.get("/api/admin/banners").auth(admin).expect(200).body();
    assertThat(all).hasSize(6);
    Map<String, String> states = new HashMap<>();
    all.forEach(b -> states.put(b.get("title").asText(), b.get("state").asText()));
    assertThat(states).containsEntry("Đã tắt", "OFF").containsEntry("Chưa tới ngày", "SCHEDULED").containsEntry("Hết hạn", "EXPIRED")
        .containsEntry("Nghỉ Tết từ 28/1", "SHOWING");
  }

  @Test
  @DisplayName("sửa, xóa; kiểm tra link, ảnh, ngày; chỉ admin")
  void manage() {
    String id = create(banner("NOTICE", "Đổi giờ làm việc"));
    JsonNode edited = api.put("/api/admin/banners/" + id).auth(admin).send(banner("NOTICE", "Từ 1/12 mở cửa 7h", "link", "https://example.com/gio", "active", false))
        .expect(200).body();
    assertThat(edited.get("title").asText()).isEqualTo("Từ 1/12 mở cửa 7h");
    assertThat(edited.get("state").asText()).isEqualTo("OFF");

    api.post("/api/admin/banners").auth(admin).send(banner("NOTICE", "x", "link", "javascript:alert(1)")).expect(400);
    api.post("/api/admin/banners").auth(admin).send(banner("NOTICE", "x", "link", "http://khong-an-toan.vn")).expect(400);
    api.post("/api/admin/banners").auth(admin).send(banner("BANNER", "x")).expect(400);
    api.post("/api/admin/banners").auth(admin).send(banner("NOTICE", " ")).expect(400);
    api.post("/api/admin/banners").auth(admin).send(banner("NOTICE", "x", "startsAt", "2026-12-10T00:00:00Z", "endsAt", "2026-12-01T00:00:00Z")).expect(400);
    api.post("/api/admin/banners/" + id + "/image").auth(admin).files("file", List.of(new Api.FilePart("a.txt", "image/png", "khong-phai-anh".getBytes())))
        .expect(400);

    String reception = fx.createUser(Role.RECEPTIONIST).token();
    api.get("/api/admin/banners").auth(reception).expect(403);
    api.post("/api/admin/banners").auth(reception).send(banner("NOTICE", "x")).expect(403);

    api.delete("/api/admin/banners/" + id).auth(admin).expect(204);
    assertThat(api.get("/api/admin/banners").auth(admin).expect(200).body()).isEmpty();
  }
}
