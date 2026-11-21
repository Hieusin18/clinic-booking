package com.clinic.export;

import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Patient;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.VisitSource;
import com.clinic.export.PrintDoc.Block;
import com.clinic.export.PrintDoc.Field;
import com.clinic.export.PrintDoc.Fields;
import com.clinic.export.PrintDoc.Grid;
import com.clinic.export.PrintDoc.Heading;
import com.clinic.export.PrintDoc.Page;
import com.clinic.export.PrintDoc.Sign;
import com.clinic.export.PrintDoc.Text;
import com.clinic.util.Icd10;
import com.clinic.util.VnTime;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Dựng bản điện tử của bệnh án ngoại trú (trang 1), phiếu kết quả cận lâm sàng (nếu có) và đơn thuốc.
 * <ul>
 *   <li>Bệnh án theo các mục của mẫu bệnh án ngoại trú Bộ Y tế: I. Hành chính, II. Lý do đến khám, III. Hỏi bệnh,
 *       IV. Khám bệnh, V. Chẩn đoán (ICD-10), VI. Điều trị, chữ ký bác sĩ.</li>
 *   <li>Đơn thuốc theo các trường của mẫu đơn thuốc, Phụ lục I Thông tư 26/2025/TT-BYT.</li>
 * </ul>
 */
public final class PrintDocBuilder {
  public static final String BLANK = "……………………";

  private PrintDocBuilder() {}

  /** Thông tin phòng khám in trên bệnh án và đơn thuốc. */
  public record Clinic(String name, String address, String phone, String code) {}

  // ---------- Định dạng ----------

  static String gender(Gender g) {
    return switch (g) {
      case MALE -> "Nam";
      case FEMALE -> "Nữ";
      default -> "Khác";
    };
  }

  /** "dd/MM/yyyy" của một ngày (cột DATE). */
  static String day(LocalDate d) {
    return d == null ? "" : VnTime.dmy(d);
  }

  /** "Ngày 06 tháng 11 năm 2026" như dòng ký tên trên giấy tờ */
  static String signDate(Instant at) {
    ZonedDateTime z = at.atZone(VnTime.ZONE);
    return String.format("Ngày %02d tháng %02d năm %d", z.getDayOfMonth(), z.getMonthValue(), z.getYear());
  }

  static String dateTime(Instant at) {
    ZonedDateTime z = at.atZone(VnTime.ZONE);
    return String.format("%02d giờ %02d phút, ngày %02d/%02d/%d", z.getHour(), z.getMinute(), z.getDayOfMonth(), z.getMonthValue(), z.getYear());
  }

  /** Thông tư 26/2025: số lượng dưới 10 ghi thêm số 0 phía trước */
  static String qty(int n) {
    return n < 10 ? "0" + n : String.valueOf(n);
  }

  /** Số kiểu Việt Nam, tối đa 1 chữ số thập phân: 1.234,5 */
  static String num(double n) {
    DecimalFormat f = new DecimalFormat("#,##0.#", DecimalFormatSymbols.getInstance(Locale.forLanguageTag("vi-VN")));
    return f.format(n);
  }

  /** Tuổi tính theo tháng và năm tại ngày khám. */
  record Age(int months, int years) {}

  static Age ageOf(LocalDate dob, LocalDate at) {
    int months = (at.getYear() - dob.getYear()) * 12 + (at.getMonthValue() - dob.getMonthValue()) - (at.getDayOfMonth() < dob.getDayOfMonth() ? 1 : 0);
    return new Age(months, Math.floorDiv(months, 12));
  }

  /** Tên thuốc theo Thông tư 26/2025: tên chung quốc tế (hoạt chất), tên thương mại trong ngoặc. */
  public static String medicineLabel(String name, String activeIngredient, String strength) {
    String inn = activeIngredient == null ? null : activeIngredient.trim();
    String base = inn != null && !inn.isEmpty() && !inn.equalsIgnoreCase(name) ? inn + " (" + name + ")" : name;
    return Stream.of(base, strength).filter(s -> s != null && !s.isEmpty()).collect(Collectors.joining(" "));
  }

  static String withIcd(String text, String codes) {
    return codes != null && !codes.isEmpty() ? text + " (" + codes + ")" : text;
  }

  /** Kích thước ảnh (điểm ảnh) đọc từ phần đầu tệp PNG/JPEG; không đọc được thì null. */
  public static int[] imageSize(byte[] b) {
    if (b.length >= 24 && u32(b, 0) == 0x89504e47L) return new int[] {(int) u32(b, 16), (int) u32(b, 20)};
    if (b.length < 4 || (b[0] & 0xff) != 0xff || (b[1] & 0xff) != 0xd8) return null;
    int i = 2;
    while (i + 9 < b.length) {
      if ((b[i] & 0xff) != 0xff) return null;
      int marker = b[i + 1] & 0xff;
      int len = u16(b, i + 2);
      // SOF0..SOF15 trừ DHT (C4), JPG (C8), DAC (CC): chứa chiều cao, chiều rộng
      if (marker >= 0xc0 && marker <= 0xcf && marker != 0xc4 && marker != 0xc8 && marker != 0xcc) {
        return new int[] {u16(b, i + 7), u16(b, i + 5)};
      }
      i += 2 + len;
    }
    return null;
  }

  private static long u32(byte[] b, int i) {
    return ((long) (b[i] & 0xff) << 24) | ((b[i + 1] & 0xff) << 16) | ((b[i + 2] & 0xff) << 8) | (b[i + 3] & 0xff);
  }

  private static int u16(byte[] b, int i) {
    return ((b[i] & 0xff) << 8) | (b[i + 1] & 0xff);
  }

  /** Thu nhỏ vào khung tối đa, giữ tỉ lệ. */
  static int[] fitBox(int w, int h, int maxW, int maxH) {
    double k = Math.min(1, Math.min((double) maxW / w, (double) maxH / h));
    return new int[] {(int) Math.round(w * k), (int) Math.round(h * k)};
  }

  private static String unit(Number n, String u) {
    return n == null ? null : num(n.doubleValue()) + " " + u;
  }

  private static String joinNonEmpty(String sep, String... parts) {
    return Stream.of(parts).filter(s -> s != null && !s.isEmpty()).collect(Collectors.joining(sep));
  }

  // ---------- Dựng mô hình in ----------

  /**
   * @param linkCode mã liên kết hồ sơ (chỉ in trên bản bác sĩ in ra đưa bệnh nhân), để bệnh nhân đăng ký app bằng số
   *     điện thoại của hồ sơ rồi nhập mã này mà xem lại lịch sử khám
   */
  public static PrintDoc build(ExportVisit v, Clinic clinic, Instant now, String linkCode) {
    MedicalRecord r = v.record();
    Patient p = v.patient();
    Age age = ageOf(p.getDateOfBirth(), v.date());
    boolean youngChild = age.months() < 72;
    String ageText = youngChild ? age.months() + " tháng" : String.valueOf(age.years());
    String doctorName = joinNonEmpty(" ", v.doctor().title(), v.doctor().fullName());
    String ymd = day(v.date());
    String[] dmy = ymd.split("/");
    String recordNo = "BA-" + dmy[2] + dmy[1] + dmy[0] + "-" + (v.source() == VisitSource.ONLINE ? "A" : "B") + String.format("%03d", v.queueNumber());
    List<String> headerLeft = Stream.of(clinic.name().toUpperCase(), clinic.address(),
        clinic.phone() == null || clinic.phone().isEmpty() ? null : "Điện thoại: " + clinic.phone())
        .filter(s -> s != null && !s.isEmpty()).toList();
    String exported = "Bản điện tử xuất từ hệ thống đặt lịch khám lúc " + dateTime(now) + ". Mã tra cứu: " + v.id();

    List<ExportVisit.Lab> labs = v.labOrders() == null ? List.of() : v.labOrders();
    List<ExportVisit.Lab> labDone = labs.stream().filter(o -> o.doneAt() != null).toList();
    String bmi = r.getWeight() != null && r.getHeight() != null && r.getWeight() != 0 && r.getHeight() != 0
        ? num(r.getWeight() / Math.pow(r.getHeight() / 100, 2)) : null;
    String icdName = Icd10.name(r.getIcdCode());
    String icdText = r.getIcdCode() == null ? null
        : r.getIcdCode() + (icdName != null && !icdName.equals(r.getDiagnosis()) ? " – " + icdName : "");

    List<Block> blocks = new ArrayList<>();
    blocks.add(new Heading("I. HÀNH CHÍNH"));
    blocks.add(Fields.of(new Field("1. Họ và tên (in hoa)", p.getFullName().toUpperCase(), true)));
    blocks.add(Fields.of(new Field("2. Ngày sinh", day(p.getDateOfBirth())), new Field("Tuổi", ageText), new Field("3. Giới tính", gender(p.getGender()))));
    blocks.add(Fields.of(new Field("4. Nghề nghiệp", p.getOccupation()), new Field("5. Dân tộc", p.getEthnicity())));
    blocks.add(Fields.of(new Field("6. Số định danh cá nhân/CCCD", p.getNationalId()), new Field("Điện thoại", p.getPhone())));
    blocks.add(Fields.of(new Field("7. Địa chỉ", p.getAddress())));
    blocks.add(Fields.of(new Field("8. Đối tượng", p.getInsuranceNo() != null && !p.getInsuranceNo().isEmpty() ? "BHYT" : "Thu phí"),
        new Field("Số thẻ BHYT", p.getInsuranceNo()), new Field("Giá trị đến", day(p.getInsuranceExpiry()))));
    blocks.add(Fields.of(new Field("9. Họ tên, điện thoại người nhà khi cần báo tin", joinNonEmpty(" – ", p.getRelativeName(), p.getRelativePhone()))));
    blocks.add(Fields.of(new Field("10. Đến khám lúc", dateTime(v.createdAt())),
        new Field("Hình thức", v.source() == VisitSource.ONLINE ? "Đặt lịch trực tuyến" : "Đến trực tiếp")));
    blocks.add(Fields.of(new Field("11. Tiền sử dị ứng", p.getAllergies() != null ? p.getAllergies() : "Chưa ghi nhận")));

    blocks.add(new Heading("II. LÝ DO ĐẾN KHÁM"));
    blocks.add(new Text(r.getReason() != null && !r.getReason().isEmpty() ? r.getReason() : BLANK, false, false, true));

    blocks.add(new Heading("III. HỎI BỆNH"));
    blocks.add(Fields.of(new Field("1. Quá trình bệnh lý", r.getSymptoms())));
    blocks.add(new Text("2. Tiền sử bệnh:", false, false, false));
    blocks.add(Fields.of(new Field("   – Bản thân", r.getPersonalHistory())));
    blocks.add(Fields.of(new Field("   – Gia đình", r.getFamilyHistory())));

    blocks.add(new Heading("IV. KHÁM BỆNH"));
    blocks.add(new Grid(List.of(
        new Field("Mạch", unit(r.getPulse(), "lần/phút")),
        new Field("Nhiệt độ", unit(r.getTemperature(), "°C")),
        new Field("Huyết áp", r.getBpSystolic() != null && r.getBpDiastolic() != null ? r.getBpSystolic() + "/" + r.getBpDiastolic() + " mmHg" : null),
        new Field("Nhịp thở", unit(r.getRespiratoryRate(), "lần/phút")),
        new Field("SpO₂", unit(r.getSpo2(), "%")),
        new Field("Cân nặng", unit(r.getWeight(), "kg")),
        new Field("Chiều cao", unit(r.getHeight(), "cm")),
        new Field("BMI", bmi)), 4));
    blocks.add(Fields.of(new Field("1. Toàn thân", r.getGeneralExam())));
    blocks.add(Fields.of(new Field("2. Các bộ phận", r.getOrganExam())));
    blocks.add(Fields.of(new Field("3. Tóm tắt kết quả cận lâm sàng", r.getLabSummary())));
    blocks.add(Fields.of(new Field("4. Chỉ định cận lâm sàng", !labs.isEmpty()
        ? labs.stream().map(ExportVisit.Lab::name).collect(Collectors.joining("; ")) + (labDone.isEmpty() ? "" : " (kết quả ở phiếu kết quả cận lâm sàng)")
        : r.getOrders())));

    blocks.add(new Heading("V. CHẨN ĐOÁN"));
    blocks.add(Fields.of(new Field("1. Bệnh chính", r.getDiagnosis(), true), new Field("Mã ICD-10", icdText)));
    blocks.add(Fields.of(new Field("2. Bệnh kèm theo", r.getSecondaryDiagnosis()), new Field("Mã ICD-10", r.getSecondaryIcdCodes())));

    blocks.add(new Heading("VI. ĐIỀU TRỊ"));
    blocks.add(Fields.of(new Field("1. Hướng xử trí, điều trị", r.getTreatment())));
    ExportVisit.Rx rx = v.prescription();
    blocks.add(Fields.of(new Field("2. Đơn thuốc", rx != null
        ? "Có, " + rx.items().size() + " loại thuốc" + (rx.code() != null ? " – mã đơn " + rx.code() : "") + " (xem trang sau)"
        : "Không kê đơn")));
    blocks.add(Fields.of(new Field("3. Hẹn tái khám", r.getFollowUpDate() != null ? "ngày " + day(r.getFollowUpDate()) : "Khi có dấu hiệu bất thường")));

    List<Page> pages = new ArrayList<>();
    pages.add(new Page(headerLeft, List.of("Số bệnh án: " + recordNo, "Mã người bệnh: " + p.getId().substring(0, 8).toUpperCase()),
        "BỆNH ÁN NGOẠI TRÚ", v.doctor().specialty() != null ? "Chuyên khoa: " + v.doctor().specialty() : null, blocks,
        new Sign(signDate(v.createdAt()), "BÁC SĨ KHÁM BỆNH", doctorName),
        linkCode != null ? "Xem lại kết quả khám trên ứng dụng: đăng ký bằng số điện thoại " + p.getPhone()
            + ", vào Lịch sử khám và nhập mã liên kết " + linkCode + "." : null));

    if (!labDone.isEmpty()) pages.add(labPage(v, labDone, headerLeft, recordNo, doctorName));
    if (rx != null) pages.add(prescriptionPage(v, rx, clinic, headerLeft, doctorName, youngChild, ageText));
    return new PrintDoc(pages, exported, "benh-an-" + recordNo);
  }

  private static Page prescriptionPage(ExportVisit v, ExportVisit.Rx rx, Clinic clinic, List<String> headerLeft, String doctorName, boolean youngChild,
      String ageText) {
    Patient p = v.patient();
    MedicalRecord r = v.record();
    List<Block> blocks = new ArrayList<>();
    blocks.add(Fields.of(new Field("Họ tên", p.getFullName().toUpperCase(), true)));
    blocks.add(Fields.of(new Field("Ngày sinh", day(p.getDateOfBirth())),
        new Field(youngChild ? "Tuổi" : "Cân nặng", youngChild ? ageText : unit(r.getWeight(), "kg")), new Field("Giới tính", gender(p.getGender()))));
    if (youngChild) blocks.add(Fields.of(new Field("Cân nặng", unit(r.getWeight(), "kg"))));
    blocks.add(Fields.of(new Field("Số định danh cá nhân/CCCD/hộ chiếu (nếu có)", p.getNationalId())));
    blocks.add(Fields.of(new Field("Mã số bảo hiểm y tế (nếu có)", p.getInsuranceNo())));
    blocks.add(Fields.of(new Field("Nơi thường trú/tạm trú/ở hiện tại", p.getAddress())));
    String diag = Stream.of(withIcd(r.getDiagnosis(), r.getIcdCode()),
        r.getSecondaryDiagnosis() != null && !r.getSecondaryDiagnosis().isEmpty() ? withIcd(r.getSecondaryDiagnosis(), r.getSecondaryIcdCodes()) : null)
        .filter(Objects::nonNull).collect(Collectors.joining("; "));
    blocks.add(Fields.of(new Field("Chẩn đoán", diag)));
    blocks.add(new Text("Thuốc điều trị:", false, true, false));
    int idx = 0;
    for (ExportVisit.Item i : rx.items()) {
      idx++;
      blocks.add(new PrintDoc.Medicine(idx, medicineLabel(i.name(), i.activeIngredient(), i.strength()), "SL: " + qty(i.quantity()) + " " + i.unit(),
          "Mỗi lần " + i.dosePerTime() + ", ngày " + qty(i.timesPerDay()) + " lần, dùng " + qty(i.days()) + " ngày."
              + (i.note() != null && !i.note().isEmpty() ? " " + i.note() : "")));
    }
    blocks.add(Fields.of(new Field("Lời dặn", rx.advice())));
    if (r.getFollowUpDate() != null) blocks.add(Fields.of(new Field("Hẹn tái khám", "ngày " + day(r.getFollowUpDate()))));
    if (youngChild) blocks.add(Fields.of(new Field("Họ tên người đưa trẻ đến khám bệnh, chữa bệnh", p.getRelativeName())));
    return new Page(headerLeft, List.of("Mã đơn thuốc: " + (rx.code() != null ? rx.code() : rx.id().substring(0, 12))), "ĐƠN THUỐC", null, blocks,
        new Sign(signDate(rx.finalizedAt() != null ? rx.finalizedAt() : v.createdAt()), "BÁC SĨ/Y SỸ KHÁM BỆNH", doctorName),
        (clinic.phone() != null && !clinic.phone().isEmpty() ? "Số điện thoại liên hệ: " + clinic.phone() + ". " : "") + "Khám lại xin mang theo đơn này.");
  }

  /** "Hình 1.1: X-quang ngực thẳng"; chỉ định có nhiều ảnh thì thêm "(ảnh 2/3)". */
  public static String imageCaption(int order, int index, int total, String orderName) {
    return "Hình " + order + "." + index + ": " + orderName + (total > 1 ? " (ảnh " + index + "/" + total + ")" : "");
  }

  /** Phiếu kết quả cận lâm sàng: mỗi chỉ định gồm mô tả, kết luận và ảnh; tệp PDF ghi số lượng để tra trên hệ thống. */
  private static Page labPage(ExportVisit v, List<ExportVisit.Lab> done, List<String> headerLeft, String recordNo, String doctorName) {
    Patient p = v.patient();
    List<Block> blocks = new ArrayList<>();
    blocks.add(Fields.of(new Field("Họ tên", p.getFullName().toUpperCase(), true)));
    blocks.add(Fields.of(new Field("Ngày sinh", day(p.getDateOfBirth())), new Field("Giới tính", gender(p.getGender()))));
    blocks.add(Fields.of(new Field("Chẩn đoán", withIcd(v.record().getDiagnosis(), v.record().getIcdCode()))));
    for (int i = 0; i < done.size(); i++) {
      ExportVisit.Lab o = done.get(i);
      blocks.add(new Heading((i + 1) + ". " + o.name().toUpperCase()));
      if (o.note() != null && !o.note().isEmpty()) blocks.add(Fields.of(new Field("Yêu cầu", o.note())));
      blocks.add(Fields.of(new Field("Kết quả", o.resultText())));
      List<ExportVisit.File> others = new ArrayList<>();
      List<ExportVisit.File> pictures = new ArrayList<>();
      List<int[]> sizes = new ArrayList<>();
      for (ExportVisit.File f : o.files()) {
        boolean image = "image/jpeg".equals(f.mimeType()) || "image/png".equals(f.mimeType());
        int[] size = image ? imageSize(f.data()) : null;
        if (size != null) {
          pictures.add(f);
          sizes.add(size);
        } else {
          others.add(f);
        }
      }
      for (int k = 0; k < pictures.size(); k++) {
        ExportVisit.File f = pictures.get(k);
        // Chú thích theo tên chỉ định, không in tên tệp: ảnh tải từ máy chụp/web thường có tên là chuỗi ký tự vô nghĩa
        blocks.add(new PrintDoc.Image(f.data(), f.mimeType(), sizes.get(k)[0], sizes.get(k)[1], imageCaption(i + 1, k + 1, pictures.size(), o.name())));
      }
      if (!others.isEmpty()) {
        blocks.add(new Text("Kèm " + others.size() + " tệp PDF kết quả gốc (xem trên hệ thống phòng khám).", true, false, false));
      }
    }
    Instant last = done.stream().map(ExportVisit.Lab::doneAt).max(Instant::compareTo).orElseThrow();
    return new Page(headerLeft, List.of("Số bệnh án: " + recordNo), "PHIẾU KẾT QUẢ CẬN LÂM SÀNG", null, blocks,
        new Sign(signDate(last), "BÁC SĨ ĐỌC KẾT QUẢ", doctorName), null);
  }
}
