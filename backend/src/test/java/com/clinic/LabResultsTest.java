package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Patient;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.Role;
import com.clinic.export.PrintDocBuilder;
import com.clinic.support.Api;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.clinic.util.LabFiles;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Cận lâm sàng: chỉ định, gửi đi, trả kết quả")
class LabResultsTest extends IntegrationTest {
  static final byte[] PDF = "%PDF-1.4\n% phiếu siêu âm\n".getBytes(StandardCharsets.UTF_8);

  /** Ảnh PNG thật (w×h điểm ảnh, màu xám) để PDF và Word nhúng được. */
  static byte[] png(int w, int h) {
    ByteArrayOutputStream raw = new ByteArrayOutputStream();
    for (int y = 0; y < h; y++) {
      raw.write(0);
      for (int x = 0; x < w; x++) raw.write(0x80);
    }
    Deflater d = new Deflater();
    d.setInput(raw.toByteArray());
    d.finish();
    byte[] buf = new byte[raw.size() + 64];
    int n = d.deflate(buf);
    byte[] idat = java.util.Arrays.copyOf(buf, n);
    byte[] ihdr = ByteBuffer.allocate(13).putInt(w).putInt(h).put((byte) 8).put((byte) 0).put((byte) 0).put((byte) 0).put((byte) 0).array();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes(new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a});
    chunk(out, "IHDR", ihdr);
    chunk(out, "IDAT", idat);
    chunk(out, "IEND", new byte[0]);
    return out.toByteArray();
  }

  private static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
    byte[] t = type.getBytes(StandardCharsets.US_ASCII);
    CRC32 crc = new CRC32();
    crc.update(t);
    crc.update(data);
    out.writeBytes(ByteBuffer.allocate(4).putInt(data.length).array());
    out.writeBytes(t);
    out.writeBytes(data);
    out.writeBytes(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
  }

  Fixtures.Login doctor;
  Fixtures.Login patient;
  String reception;

  @BeforeEach
  void setUp() {
    doctor = fx.createDoctor();
    patient = fx.createPatient();
    reception = fx.createUser(Role.RECEPTIONIST).token();
  }

  record Exam(String visitId, String orderId) {}

  /** Bệnh nhân lấy số rồi được gọi vào khám, bác sĩ ghi bệnh án và một chỉ định. */
  Exam examWithOrder(String name) {
    var ticket = api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201).body();
    String visitId = ticket.get("id").asText();
    api.post("/api/queue/call-next").auth(doctor.token()).expect(200);
    api.put("/api/visits/" + visitId + "/record").auth(doctor.token()).send(Map.of("symptoms", "Ho, sốt 3 ngày", "diagnosis", "Viêm phổi?")).expect(200);
    var order = api.post("/api/visits/" + visitId + "/lab-orders").auth(doctor.token()).send(Map.of("name", name, "note", "Tư thế đứng")).expect(201).body();
    return new Exam(visitId, order.get("id").asText());
  }

  Exam examWithOrder() {
    return examWithOrder("X-quang ngực thẳng");
  }

  JsonNode walkIn() {
    Patient p = new Patient();
    p.setFullName("Bà Tư");
    p.setPhone(Fixtures.nextPhone());
    p.setDateOfBirth(LocalDate.parse("1960-02-02"));
    p.setGender(Gender.FEMALE);
    patients.saveAndFlush(p);
    return api.post("/api/queue/tickets").auth(reception).send(Map.of("patientId", p.getId(), "doctorId", doctor.doctor().getId())).expect(201).body();
  }

  Api.Req upload(String orderId, byte[] data, String name) {
    String type = name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "application/octet-stream";
    return api.post("/api/lab-orders/" + orderId + "/files").auth(doctor.token()).files("file", List.of(new Api.FilePart(name, type, data)));
  }

  void giveResult(String orderId) {
    upload(orderId, png(40, 30), "phim-phổi.png").expect(201);
    api.patch("/api/lab-orders/" + orderId).auth(doctor.token()).send(Map.of("resultText", "Đám mờ thùy dưới phổi phải", "done", true)).expect(200);
  }

  @Test
  @DisplayName("gửi đi cận lâm sàng thì bác sĩ gọi được người tiếp theo; có kết quả quay lại được gọi trước")
  void sendAndReturn() {
    Exam e = examWithOrder();
    walkIn();
    var sent = api.post("/api/visits/" + e.visitId() + "/send-for-tests").auth(doctor.token()).send(Map.of("mode", "RETURN")).expect(200).body();
    assertThat(sent.get("status").asText()).isEqualTo("AWAITING_RESULTS");
    assertThat(sent.get("resultMode").asText()).isEqualTo("RETURN");
    assertThat(sent.get("labOrders")).hasSize(1);
    assertThat(sent.at("/labOrders/0/name").asText()).isEqualTo("X-quang ngực thẳng");
    assertThat(sent.at("/labOrders/0/doneAt").isNull()).isTrue();

    // Bác sĩ không bị "đang khám" giữ lại
    var next = api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body();
    assertThat(next.at("/patient/fullName").asText()).isEqualTo("Bà Tư");
    var awaiting = api.get("/api/lab/awaiting-visits").auth(doctor.token()).expect(200).body();
    assertThat(AdminTest.texts(awaiting, "id")).containsExactly(e.visitId());

    // Chưa có kết quả thì chưa đưa lại hàng chờ được
    assertThat(api.post("/api/visits/" + e.visitId() + "/results-ready").auth(doctor.token()).expect(409).body().get("message").asText())
        .startsWith("Chưa trả kết quả: X-quang");
    giveResult(e.orderId());
    api.post("/api/visits/" + e.visitId() + "/results-ready").auth(doctor.token()).expect(200);
    walkIn();
    api.patch("/api/queue/" + next.get("id").asText() + "/left").auth(doctor.token()).expect(200);

    var back = api.post("/api/queue/call-next").auth(doctor.token()).expect(200).body();
    assertThat(back.get("id").asText()).isEqualTo(e.visitId());
    assertThat(back.get("callRule").asText()).isEqualTo("RESULTS");
    // Chế độ quay lại thì không hoàn tất được khi bệnh nhân chưa vào lại; giờ đã vào thì được
    api.post("/api/visits/" + e.visitId() + "/complete").auth(doctor.token()).expect(200);
  }

  @Test
  @DisplayName("nhận kết quả online: bác sĩ hoàn tất khi chưa gặp lại, bệnh nhân chỉ thấy kết quả sau khi hoàn tất")
  void online() {
    Exam e = examWithOrder("Siêu âm ổ bụng");
    api.post("/api/visits/" + e.visitId() + "/send-for-tests").auth(doctor.token()).send(Map.of("mode", "ONLINE")).expect(200);
    upload(e.orderId(), PDF, "phieu-sieu-am.pdf").expect(201);
    api.patch("/api/lab-orders/" + e.orderId()).auth(doctor.token()).send(Map.of("resultText", "Gan nhiễm mỡ độ I", "done", true)).expect(200);

    // Trong lúc chờ: lịch sử của bệnh nhân có lượt này nhưng chưa thấy kết quả
    var history = api.get("/api/visits/mine").auth(patient.token()).expect(200).body();
    assertThat(history.at("/0/id").asText()).isEqualTo(e.visitId());
    assertThat(history.at("/0/status").asText()).isEqualTo("AWAITING_RESULTS");
    assertThat(history.at("/0/resultMode").asText()).isEqualTo("ONLINE");
    var hidden = api.get("/api/visits/" + e.visitId()).auth(patient.token()).expect(200).body();
    assertThat(hidden.get("labOrders")).hasSize(1);
    assertThat(hidden.at("/labOrders/0/name").asText()).isEqualTo("Siêu âm ổ bụng");
    assertThat(hidden.at("/labOrders/0/resultText").isNull()).isTrue();
    assertThat(hidden.at("/labOrders/0/files")).isEmpty();

    api.post("/api/visits/" + e.visitId() + "/complete").auth(doctor.token()).expect(200);
    var shown = api.get("/api/visits/" + e.visitId()).auth(patient.token()).expect(200).body();
    JsonNode o = shown.at("/labOrders/0");
    assertThat(o.get("resultText").asText()).isEqualTo("Gan nhiễm mỡ độ I");
    assertThat(o.get("files")).hasSize(1);
    assertThat(o.at("/files/0/fileName").asText()).isEqualTo("phieu-sieu-am.pdf");
    assertThat(o.at("/files/0/mimeType").asText()).isEqualTo("application/pdf");

    // Mở tệp bằng đường dẫn có chữ ký, không cần đăng nhập; sửa chữ ký thì bị từ chối
    String url = o.at("/files/0/url").asText();
    var file = api.get("/api" + url).expect(200);
    assertThat(file.header("Content-Type")).isEqualTo("application/pdf");
    assertThat(file.header("Content-Disposition")).startsWith("inline");
    // Đổi ký tự đầu của chữ ký thành ký tự khác (chữ ký ngẫu nhiên có thể vốn bắt đầu bằng "x")
    int at = url.indexOf("sig=") + 4;
    String tampered = url.substring(0, at) + (url.charAt(at) == 'x' ? 'y' : 'x') + url.substring(at + 1);
    api.get("/api" + tampered).expect(404);
  }

  @Test
  @DisplayName("kiểm tra khi trả kết quả, gửi đi và hoàn tất")
  void checks() {
    Exam e = examWithOrder();
    // Trả kết quả mà chưa có mô tả hay tệp
    api.patch("/api/lab-orders/" + e.orderId()).auth(doctor.token()).send(Map.of("done", true)).expect(400);
    // Tệp không phải ảnh hay PDF
    assertThat(upload(e.orderId(), "MZ fake exe".getBytes(StandardCharsets.US_ASCII), "virus.exe").expect(400).body().get("message").asText())
        .contains("JPG, PNG hoặc tệp PDF");
    // Còn chỉ định chưa có kết quả thì chưa hoàn tất được
    assertThat(api.post("/api/visits/" + e.visitId() + "/complete").auth(doctor.token()).expect(409).body().get("message").asText()).contains("Chưa trả kết quả");
    api.post("/api/visits/" + e.visitId() + "/send-for-tests").auth(doctor.token()).send(Map.of("mode", "MAYBE")).expect(400);
    api.post("/api/visits/" + e.visitId() + "/send-for-tests").auth(doctor.token()).send(Map.of("mode", "RETURN")).expect(200);
    // Chế độ quay lại: không hoàn tất khi bệnh nhân chưa vào lại
    giveResult(e.orderId());
    assertThat(api.post("/api/visits/" + e.visitId() + "/complete").auth(doctor.token()).expect(409).body().get("message").asText()).contains("đưa vào hàng chờ");
    // Đã có tệp thì không xóa chỉ định được
    api.delete("/api/lab-orders/" + e.orderId()).auth(doctor.token()).expect(409);
    // Bác sĩ khác không thấy, không sửa được
    var other = fx.createDoctor();
    api.patch("/api/lab-orders/" + e.orderId()).auth(other.token()).send(Map.of("resultText", "x")).expect(404);
    // Bệnh nhân không gọi được API của bác sĩ
    api.post("/api/visits/" + e.visitId() + "/lab-orders").auth(patient.token()).send(Map.of("name", "CT sọ não")).expect(403);
  }

  @Test
  @DisplayName("chỉ định chưa có kết quả thì xóa được; xóa tệp, mở lại chỉ định")
  void deleteAndReopen() {
    Exam e = examWithOrder();
    var second = api.post("/api/visits/" + e.visitId() + "/lab-orders").auth(doctor.token()).send(Map.of("name", "Công thức máu")).expect(201).body();
    api.delete("/api/lab-orders/" + second.get("id").asText()).auth(doctor.token()).expect(204);
    var withFile = upload(e.orderId(), png(8, 8), "a.png").expect(201).body();
    api.patch("/api/lab-orders/" + e.orderId()).auth(doctor.token()).send(Map.of("done", true)).expect(200);
    var reopened = api.patch("/api/lab-orders/" + e.orderId()).auth(doctor.token()).send(Map.of("done", false)).expect(200).body();
    assertThat(reopened.get("doneAt").isNull()).isTrue();
    var after = api.delete("/api/lab-files/" + withFile.at("/files/0/id").asText()).auth(doctor.token()).expect(200).body();
    assertThat(after.get("files")).isEmpty();
    api.delete("/api/lab-orders/" + e.orderId()).auth(doctor.token()).expect(204);
  }

  @Test
  @DisplayName("bệnh án xuất ra có phiếu kết quả cận lâm sàng kèm ảnh")
  void exportWithImages() throws Exception {
    Exam e = examWithOrder();
    giveResult(e.orderId());
    upload(e.orderId(), PDF, "ket-qua-goc.pdf").expect(201);
    api.post("/api/visits/" + e.visitId() + "/complete").auth(doctor.token()).expect(200);

    var html = api.get("/api/visits/" + e.visitId() + "/record.html").auth(patient.token()).expect(200);
    assertThat(html.header("Content-Security-Policy")).contains("img-src data:");
    assertThat(html.text()).contains("PHIẾU KẾT QUẢ CẬN LÂM SÀNG");
    assertThat(html.text()).contains("4. Chỉ định cận lâm sàng: </span><span class=\"\">X-quang ngực thẳng (kết quả ở phiếu kết quả cận lâm sàng)");
    assertThat(html.text()).contains("Đám mờ thùy dưới phổi phải");
    assertThat(html.text()).contains("<img src=\"data:image/png;base64,");
    // Chú thích ảnh theo tên chỉ định, không in tên tệp gốc
    assertThat(html.text()).contains("Hình 1.1: X-quang ngực thẳng").doesNotContain("phim-ph").doesNotContain("ket-qua-goc");
    assertThat(html.text()).contains("Kèm 1 tệp PDF kết quả gốc (xem trên hệ thống phòng khám).");

    var pdf = api.get("/api/visits/" + e.visitId() + "/record.pdf").auth(patient.token()).expect(200);
    assertThat(new String(pdf.bytes(), 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    assertThat(new String(pdf.bytes(), StandardCharsets.ISO_8859_1)).containsPattern("/Subtype ?/Image");
    var docx = api.get("/api/visits/" + e.visitId() + "/record.docx").auth(patient.token()).expect(200);
    assertThat(MedicalRecordTest.zipEntries(docx.bytes())).anyMatch(f -> f.startsWith("word/media/"));
  }

  @Nested
  @DisplayName("Tệp kết quả")
  class Files {
    @Test
    @DisplayName("nhận diện loại tệp theo nội dung")
    void detect() {
      assertThat(LabFiles.detect(png(2, 2))).isEqualTo("image/png");
      assertThat(LabFiles.detect(new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0})).isEqualTo("image/jpeg");
      assertThat(LabFiles.detect(PDF)).isEqualTo("application/pdf");
      assertThat(LabFiles.detect("GIF89a".getBytes(StandardCharsets.US_ASCII))).isNull();
    }

    @Test
    @DisplayName("giữ tên tệp tiếng Việt, bỏ đường dẫn; thiếu tên thì đặt tên theo loại")
    void fileName() {
      assertThat(LabFiles.cleanFileName("C:\\phim\\X-quang phổi.png", "image/png")).isEqualTo("X-quang phổi.png");
      assertThat(LabFiles.cleanFileName("", "application/pdf")).isEqualTo("ket-qua.pdf");
    }

    @Test
    @DisplayName("tên tệp tiếng Việt tải lên giữ nguyên dấu")
    void uploadName() {
      Exam e = examWithOrder();
      var res = upload(e.orderId(), png(4, 4), "X-quang phổi.png").expect(201).body();
      assertThat(res.at("/files/0/fileName").asText()).isEqualTo("X-quang phổi.png");
    }

    @Test
    @DisplayName("đường dẫn có chữ ký hết hạn sau 1 giờ")
    void signedLink() {
      long now = Instant.parse("2026-11-07T03:00:00Z").toEpochMilli();
      String path = LabFiles.signedPath("bí mật", "f1", now);
      Map<String, String> q = new HashMap<>();
      for (String kv : URI.create("http://x" + path).getRawQuery().split("&")) q.put(kv.split("=", 2)[0], kv.split("=", 2)[1]);
      String exp = q.get("exp");
      String sig = q.get("sig");
      assertThat(LabFiles.verifyLink("bí mật", "f1", exp, sig, now + 59 * 60_000)).isTrue();
      assertThat(LabFiles.verifyLink("bí mật", "f1", exp, sig, now + 61 * 60_000)).isFalse();
      assertThat(LabFiles.verifyLink("bí mật", "f2", exp, sig, now)).isFalse();
      assertThat(LabFiles.verifyLink("khác", "f1", exp, sig, now)).isFalse();
    }

    @Test
    @DisplayName("đọc kích thước ảnh PNG và JPEG")
    void imageSize() {
      assertThat(PrintDocBuilder.imageSize(png(40, 30))).containsExactly(40, 30);
      // JPEG tối giản: SOI, APP0 (độ dài 16), SOF0 cao 480 rộng 640
      ByteArrayOutputStream jpg = new ByteArrayOutputStream();
      jpg.writeBytes(new byte[] {(byte) 0xff, (byte) 0xd8});
      jpg.writeBytes(new byte[] {(byte) 0xff, (byte) 0xe0, 0x00, 0x10});
      jpg.writeBytes(new byte[14]);
      jpg.writeBytes(new byte[] {(byte) 0xff, (byte) 0xc0, 0x00, 0x11, 0x08, 0x01, (byte) 0xe0, 0x02, (byte) 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0});
      assertThat(PrintDocBuilder.imageSize(jpg.toByteArray())).containsExactly(640, 480);
      assertThat(PrintDocBuilder.imageSize("not an image".getBytes(StandardCharsets.US_ASCII))).isNull();
    }
  }
}
