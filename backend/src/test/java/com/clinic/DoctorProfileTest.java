package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Schedule;
import com.clinic.entity.enums.Role;
import com.clinic.support.Api;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.DoctorProfile;
import com.clinic.util.VnTime;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Hồ sơ bác sĩ")
class DoctorProfileTest extends IntegrationTest {
  static final byte[] PNG = concat(new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}, "anh-thu".getBytes(StandardCharsets.US_ASCII));
  static final int YEAR = DoctorProfile.currentYear(Instant.now());

  static byte[] concat(byte[] a, byte[] b) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes(a);
    out.writeBytes(b);
    return out.toByteArray();
  }

  record E(String title, int fromYear, Integer toYear) {}

  @Nested
  @DisplayName("hàm thuần")
  class Pure {
    @Test
    @DisplayName("thế mạnh lưu mỗi dòng một mục, bỏ trùng và dòng trống")
    void expertise() {
      assertThat(DoctorProfile.joinExpertise(List.of(" Tăng huyết áp ", "Đái tháo đường", "Tăng huyết áp", ""))).isEqualTo("Tăng huyết áp\nĐái tháo đường");
      assertThat(DoctorProfile.joinExpertise(List.of())).isNull();
      assertThat(DoctorProfile.splitExpertise(null)).isEmpty();
      assertThat(DoctorProfile.splitExpertise("A\nB")).containsExactly("A", "B");
    }

    @Test
    @DisplayName("việc đang làm đứng đầu, rồi theo năm kết thúc giảm dần")
    void order() {
      List<E> list = List.of(new E("cũ", 2005, 2010), new E("nay", 2018, null), new E("giữa", 2010, 2018));
      assertThat(DoctorProfile.newestFirst(list, E::fromYear, E::toYear)).extracting(E::title).containsExactly("nay", "giữa", "cũ");
    }

    @Test
    @DisplayName("năm kinh nghiệm và năm hiện tại tính theo giờ Việt Nam")
    void years() {
      // 17:30 UTC ngày 31/12 = 00:30 ngày 1/1 ở Việt Nam
      assertThat(DoctorProfile.currentYear(Instant.parse("2026-12-31T17:30:00Z"))).isEqualTo(2027);
      assertThat(DoctorProfile.experienceYears(2011, Instant.parse("2026-06-01T00:00:00Z"))).isEqualTo(15);
      assertThat(DoctorProfile.experienceYears(null, Instant.now())).isNull();
    }

    @Test
    @DisplayName("nhận diện ảnh theo nội dung, không theo tên file")
    void detect() {
      assertThat(DoctorProfile.detectImage(new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0})).isEqualTo("image/jpeg");
      assertThat(DoctorProfile.detectImage(PNG)).isEqualTo("image/png");
      assertThat(DoctorProfile.detectImage("RIFF0000WEBPVP8 ".getBytes(StandardCharsets.US_ASCII))).isEqualTo("image/webp");
      assertThat(DoctorProfile.detectImage("<svg onload=alert(1)>".getBytes(StandardCharsets.US_ASCII))).isNull();
    }
  }

  String admin;
  Fixtures.Login doctor;

  @BeforeEach
  void setUp() {
    admin = fx.createUser(Role.ADMIN).token();
    doctor = fx.createDoctor();
  }

  static Map<String, Object> entry(Integer from, Integer to, String title, String place) {
    Map<String, Object> m = new HashMap<>();
    m.put("fromYear", from);
    m.put("toYear", to);
    m.put("title", title);
    m.put("place", place);
    return m;
  }

  static Map<String, Object> profile() {
    return Map.of("bio", "Khám và điều trị bệnh nội khoa", "practiceSince", 2011, "expertise", List.of("Tăng huyết áp", "Đái tháo đường"), "education",
        List.of(entry(2005, 2011, "Bác sĩ đa khoa", "Đại học Y Hà Nội")), "career",
        List.of(entry(2011, 2018, "Bác sĩ điều trị", "Bệnh viện Bạch Mai"), entry(2018, null, "Trưởng khoa Nội", "Phòng khám Đa khoa")));
  }

  String id() {
    return doctor.doctor().getId();
  }

  @Test
  @DisplayName("API công khai không lộ số điện thoại và email của bác sĩ; admin vẫn thấy")
  void publicApi() {
    String name = doctor.user().getFullName();
    assertThat(api.get("/api/doctors").expect(200).body().at("/items/0/user").toString()).isEqualTo("{\"fullName\":\"" + name + "\"}");
    assertThat(api.get("/api/doctors/" + id()).expect(200).body().get("user").toString()).isEqualTo("{\"fullName\":\"" + name + "\"}");
    assertThat(api.get("/api/doctors/all").auth(admin).expect(200).body().at("/items/0/user/phone").asText()).isEqualTo(doctor.user().getPhone());
  }

  @Test
  @DisplayName("admin nhập hồ sơ; bệnh nhân xem quá trình công tác, việc hiện tại đứng đầu")
  void profileView() {
    api.patch("/api/doctors/" + id()).auth(admin).send(profile()).expect(200);
    JsonNode res = api.get("/api/doctors/" + id()).expect(200).body();
    assertThat(res.get("bio").asText()).isEqualTo("Khám và điều trị bệnh nội khoa");
    assertThat(res.get("practiceSince").asInt()).isEqualTo(2011);
    assertThat(res.get("experienceYears").asInt()).isEqualTo(YEAR - 2011);
    List<String> expertise = new ArrayList<>();
    res.get("expertise").forEach(x -> expertise.add(x.asText()));
    assertThat(expertise).containsExactly("Tăng huyết áp", "Đái tháo đường");
    assertThat(res.get("avatarVersion").isNull()).isTrue();
    assertThat(res.get("education")).hasSize(1);
    JsonNode edu = res.at("/education/0");
    assertThat(List.of(edu.get("title").asText(), edu.get("place").asText(), edu.get("fromYear").asText(), edu.get("toYear").asText()))
        .containsExactly("Bác sĩ đa khoa", "Đại học Y Hà Nội", "2005", "2011");
    List<String> career = new ArrayList<>();
    res.get("career").forEach(c -> career.add(c.get("title").asText() + "/" + (c.get("toYear").isNull() ? "null" : c.get("toYear").asText())));
    assertThat(career).containsExactly("Trưởng khoa Nội/null", "Bác sĩ điều trị/2018");
  }

  @Test
  @DisplayName("gửi danh sách mới thì thay toàn bộ danh sách cũ; không gửi thì giữ nguyên")
  void replaceLists() {
    api.patch("/api/doctors/" + id()).auth(admin).send(profile()).expect(200);
    Map<String, Object> one = new HashMap<>(Map.of("fromYear", 2020, "title", "Phó khoa Nội", "place", "Phòng khám Đa khoa"));
    api.patch("/api/doctors/" + id()).auth(admin).send(Map.of("career", List.of(one))).expect(200);
    JsonNode res = api.get("/api/doctors/" + id()).expect(200).body();
    assertThat(res.get("career")).hasSize(1);
    assertThat(res.at("/career/0/title").asText()).isEqualTo("Phó khoa Nội");
    assertThat(res.at("/career/0/toYear").isNull()).isTrue();
    assertThat(res.get("education")).hasSize(1);
  }

  Schedule slot(LocalDate date, Instant start, Instant end, boolean booked) {
    Schedule s = new Schedule();
    s.setDoctorId(id());
    s.setDate(date);
    s.setStartTime(start);
    s.setEndTime(end);
    s.setBooked(booked);
    return schedules.saveAndFlush(s);
  }

  @Test
  @DisplayName("danh sách bác sĩ kèm số chỗ trống hôm nay và công việc hiện tại; xem giờ đã đặt khi cần")
  void freeToday() {
    api.patch("/api/doctors/" + id()).auth(admin).send(profile()).expect(200);
    Instant now = Instant.now();
    LocalDate today = VnTime.today(now);
    slot(today, now.plusSeconds(30 * 60), now.plusSeconds(45 * 60), false);
    slot(today, now.plusSeconds(45 * 60), now.plusSeconds(60 * 60), true);
    slot(today, now.minusSeconds(60 * 60), now.minusSeconds(45 * 60), false);
    JsonNode item = api.get("/api/doctors").expect(200).body().at("/items/0");
    assertThat(item.get("freeToday").asInt()).isEqualTo(1);
    assertThat(item.get("currentPosition").asText()).isEqualTo("Trưởng khoa Nội · Phòng khám Đa khoa");
    String ymd = today.toString();
    assertThat(api.get("/api/doctors/" + id() + "/schedules?date=" + ymd).expect(200).body()).hasSize(1);
    JsonNode all = api.get("/api/doctors/" + id() + "/schedules?date=" + ymd + "&all=true").expect(200).body();
    assertThat(List.of(all.at("/0/isBooked").asBoolean(), all.at("/1/isBooked").asBoolean())).containsExactly(false, true);
    assertThat(Instant.parse(all.at("/0/startTime").asText()).toEpochMilli() - Instant.parse(all.at("/0/checkinOpensAt").asText()).toEpochMilli())
        .isEqualTo(30 * 60_000L);
  }

  @Test
  @DisplayName("năm không hợp lệ thì báo lỗi rõ ràng")
  void invalidYears() {
    java.util.function.Function<Map<String, Object>, String> send = body -> api.patch("/api/doctors/" + id()).auth(admin).send(body).expect(400).body()
        .get("message").asText();
    assertThat(send.apply(Map.of("career", List.of(entry(2015, 2010, "Bác sĩ", "Bệnh viện A"))))).isEqualTo("\"Bác sĩ\": năm kết thúc phải từ năm bắt đầu trở đi");
    assertThat(send.apply(Map.of("career", List.of(entry(YEAR + 1, null, "Bác sĩ", "Bệnh viện A"))))).isEqualTo("\"Bác sĩ\": năm bắt đầu không được sau năm hiện tại");
    assertThat(send.apply(Map.of("education", List.of(entry(2015, YEAR + 1, "Nội trú", "Đại học Y"))))).contains("năm kết thúc không được sau năm hiện tại");
    assertThat(send.apply(Map.of("practiceSince", YEAR + 1))).isEqualTo("Năm bắt đầu hành nghề không được sau năm hiện tại");
  }

  @Test
  @DisplayName("bác sĩ tự sửa hồ sơ nhưng không đổi được học vị; vai trò khác không sửa được")
  void selfEdit() {
    JsonNode res = api.patch("/api/doctors/me").auth(doctor.token()).send(Map.of("bio", "Tự giới thiệu", "title", "GS.TS", "career", profile().get("career")))
        .expect(200).body();
    assertThat(res.get("bio").asText()).isEqualTo("Tự giới thiệu");
    assertThat(res.get("title").isNull()).isTrue();
    assertThat(res.get("career")).hasSize(2);
    assertThat(api.get("/api/doctors/me").auth(doctor.token()).expect(200).body().get("id").asText()).isEqualTo(id());

    var patient = fx.createPatient();
    api.patch("/api/doctors/me").auth(patient.token()).send(Map.of("bio", "x")).expect(403);
    api.patch("/api/doctors/" + id()).auth(doctor.token()).send(Map.of("bio", "x")).expect(403);
  }

  @Test
  @DisplayName("bác sĩ đã khóa không hiện hồ sơ công khai; admin vẫn xem để sửa")
  void lockedHidden() {
    api.patch("/api/doctors/" + id()).auth(admin).send(Map.of("isActive", false)).expect(200);
    api.get("/api/doctors/" + id()).expect(404);
    assertThat(api.get("/api/doctors/" + id() + "/full").auth(admin).expect(200).body().at("/user/isActive").asBoolean()).isFalse();
  }

  Api.Req avatar(String path, String token, byte[] data, String name) {
    return api.post(path).auth(token).files("file", List.of(new Api.FilePart(name, "image/png", data)));
  }

  @Test
  @DisplayName("ảnh đại diện: chỉ nhận ảnh thật, tối đa 2 MB; xem công khai; xóa được")
  void avatarUpload() {
    String id = id();
    api.post("/api/doctors/me/avatar").auth(doctor.token()).expect(400);
    assertThat(avatar("/api/doctors/me/avatar", doctor.token(), "<svg/>".getBytes(StandardCharsets.US_ASCII), "a.png").expect(400).body().get("message").asText())
        .isEqualTo("Ảnh phải là JPG, PNG hoặc WebP");
    byte[] big = concat(PNG, new byte[2 * 1024 * 1024]);
    assertThat(avatar("/api/doctors/me/avatar", doctor.token(), big, "a.png").expect(400).body().get("message").asText()).isEqualTo("Ảnh tối đa 2 MB");

    JsonNode up = avatar("/api/doctors/me/avatar", doctor.token(), PNG, "anh.png").expect(200).body();
    assertThat(up.get("avatarVersion").isNumber()).isTrue();
    var img = api.get("/api/doctors/" + id + "/avatar").expect(200);
    assertThat(img.header("Content-Type")).isEqualTo("image/png");
    assertThat(img.header("X-Content-Type-Options")).isEqualTo("nosniff");
    assertThat(Arrays.equals(img.bytes(), PNG)).isTrue();

    api.delete("/api/doctors/" + id + "/avatar").auth(admin).expect(200);
    api.get("/api/doctors/" + id + "/avatar").expect(404);
    avatar("/api/doctors/" + id + "/avatar", admin, PNG, "anh.png").expect(200);
    api.delete("/api/doctors/me/avatar").auth(doctor.token()).expect(200);
    api.get("/api/doctors/" + id + "/avatar").expect(404);
  }

  @Test
  @DisplayName("số giờ còn trống từng ngày trong 7 ngày tới")
  void availability() {
    Instant now = Instant.now();
    LocalDate tomorrow = VnTime.today(now).plusDays(1);
    long day = 86_400L;
    slot(tomorrow, now.plusSeconds(day), now.plusSeconds(day + 900), false);
    slot(tomorrow, now.plusSeconds(day + 900), now.plusSeconds(day + 1800), false);
    slot(tomorrow, now.plusSeconds(day + 1800), now.plusSeconds(day + 2700), true);
    JsonNode res = api.get("/api/doctors/" + id() + "/availability").expect(200).body();
    assertThat(res).hasSize(7);
    assertThat(res.get(1).toString()).isEqualTo("{\"date\":\"" + tomorrow + "\",\"free\":2}");
    assertThat(res.at("/0/free").asInt()).isZero();
    assertThat(api.get("/api/doctors/" + id() + "/availability?days=3").expect(200).body()).hasSize(3);
    api.get("/api/doctors/khong-co/availability").expect(404);
  }
}
