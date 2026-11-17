package com.clinic.cli;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dữ liệu lịch sử MẪU cho trang Thống kê khi demo (bệnh nhân hư cấu, số liệu sinh ngẫu nhiên có quy luật).
 * Không dùng trên hệ thống thật. Chạy sau lệnh "seed" (cần bác sĩ, chuyên khoa và danh mục thuốc).
 * <pre>
 *   java -jar app.jar seed-history            # 60 ngày gần nhất (bỏ Chủ nhật và những ngày đã có lượt khám thật)
 *   java -jar app.jar seed-history --days 90
 *   java -jar app.jar seed-history --reset    # xóa dữ liệu mẫu đã tạo
 * </pre>
 * Bệnh nhân mẫu có số điện thoại 0989xxxxxx; xóa được trọn vẹn bằng --reset.
 */
@Component
public class SeedHistory {
  static final String PHONE_PREFIX = "0989";
  private static final long MINUTE = 60_000L;
  private static final long DAY = 24 * 60 * MINUTE;

  private final JdbcTemplate jdbc;

  public SeedHistory(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  // ---- Ngẫu nhiên có hạt giống (mulberry32 như bản cũ): chạy lại cho cùng kết quả ----
  private int seed = 20261108;

  double rand() {
    seed += 0x6d2b79f5;
    int t = (seed ^ (seed >>> 15)) * (1 | seed);
    t = (t + ((t ^ (t >>> 7)) * (61 | t))) ^ t;
    return Integer.toUnsignedLong(t ^ (t >>> 14)) / 4294967296.0;
  }

  private double between(double a, double b) {
    return a + rand() * (b - a);
  }

  private int integer(int a, int b) {
    return (int) Math.floor(between(a, b + 1));
  }

  private <T> T pick(List<T> xs) {
    return xs.get((int) Math.floor(rand() * xs.size()));
  }

  /** Lệch phải như thời gian chờ thật: phần lớn ngắn, ít lượt rất lâu. */
  private double skewed(double min, double typical, double max) {
    return Math.min(max, min + (typical - min) * -Math.log(1 - rand() * 0.95));
  }

  /** Giờ Việt Nam (phút trong ngày) của ngày {@code d}. */
  private static Instant at(LocalDate d, double minutesOfDay) {
    return d.atStartOfDay().toInstant(ZoneOffset.ofHours(7)).plusMillis(Math.round(minutesOfDay * MINUTE));
  }

  private static LocalDateTime ts(Instant i) {
    return i == null ? null : LocalDateTime.ofInstant(i, ZoneOffset.UTC);
  }

  private static String id() {
    return UUID.randomUUID().toString();
  }

  // ---- Danh mục chẩn đoán theo chuyên khoa (mã ICD-10, thuốc thường kê) ----
  record Dx(String code, String name, int weight, List<String> meds, String lab) {}

  static final Map<String, List<Dx>> DIAGNOSES = Map.of(
      "Nội tổng quát", List.of(
          new Dx("J06.9", "Nhiễm trùng đường hô hấp trên cấp", 9, List.of("Paracetamol", "Acetylcystein", "Vitamin C"), null),
          new Dx("I10", "Tăng huyết áp vô căn", 7, List.of("Vitamin C"), "Xét nghiệm mỡ máu"),
          new Dx("K29.7", "Viêm dạ dày", 6, List.of("Omeprazol", "Smecta"), null),
          new Dx("E78.5", "Rối loạn lipid máu", 4, List.of("Vitamin C"), "Xét nghiệm mỡ máu"),
          new Dx("K76.0", "Gan nhiễm mỡ", 3, List.of("Vitamin C"), "Siêu âm ổ bụng"),
          new Dx("A09", "Tiêu chảy nhiễm khuẩn", 3, List.of("Oresol", "Berberin", "Smecta"), null),
          new Dx("J18.9", "Viêm phổi", 2, List.of("Augmentin", "Paracetamol", "Acetylcystein"), "X-quang ngực thẳng")),
      "Nhi khoa", List.of(
          new Dx("J00", "Viêm mũi họng cấp", 9, List.of("Hapacol 250", "Natri clorid 0,9%"), null),
          new Dx("J20.9", "Viêm phế quản cấp", 5, List.of("Hapacol 250", "Acetylcystein", "Amoxicillin"), "X-quang ngực thẳng"),
          new Dx("A09", "Tiêu chảy nhiễm khuẩn", 5, List.of("Oresol", "Smecta"), null),
          new Dx("B34.9", "Nhiễm virus", 4, List.of("Hapacol 250", "Vitamin C"), "Công thức máu"),
          new Dx("L50.9", "Mày đay", 2, List.of("Cetirizin"), null)),
      "Tai Mũi Họng", List.of(
          new Dx("J02.9", "Viêm họng cấp", 9, List.of("Paracetamol", "Amoxicillin"), null),
          new Dx("J01.9", "Viêm xoang cấp", 5, List.of("Augmentin", "Otrivin", "Natri clorid 0,9%"), "Nội soi tai mũi họng"),
          new Dx("J30.4", "Viêm mũi dị ứng", 5, List.of("Loratadin", "Natri clorid 0,9%"), null),
          new Dx("H66.9", "Viêm tai giữa", 3, List.of("Amoxicillin", "Paracetamol"), "Nội soi tai mũi họng")),
      "Da liễu", List.of(
          new Dx("L70.0", "Mụn trứng cá", 8, List.of("Fucidin"), null),
          new Dx("L20.9", "Viêm da cơ địa", 5, List.of("Cetirizin", "Fucidin"), null),
          new Dx("L50.9", "Mày đay", 4, List.of("Loratadin"), null),
          new Dx("B35.4", "Nấm da thân", 3, List.of("Cetirizin"), null)),
      "Răng Hàm Mặt", List.of(
          new Dx("K02.9", "Sâu răng", 8, List.of("Paracetamol", "Clorhexidin súc miệng"), null),
          new Dx("K05.1", "Viêm lợi mạn", 5, List.of("Clorhexidin súc miệng", "Metronidazol"), null),
          new Dx("K03.6", "Cao răng", 5, List.of("Clorhexidin súc miệng"), null)));

  static final List<String> FAMILY = List.of("Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý");
  static final List<String> MIDDLE_M = List.of("Văn", "Đức", "Minh", "Quang", "Hữu", "Tiến", "Thanh");
  static final List<String> MIDDLE_F = List.of("Thị", "Ngọc", "Thu", "Thanh", "Minh", "Phương", "Hồng");
  static final List<String> GIVEN_M = List.of("Hùng", "Dũng", "Nam", "Long", "Khánh", "Tuấn", "Phong", "Huy", "Sơn", "Quân", "Bảo", "Đạt", "Hải", "Thắng");
  static final List<String> GIVEN_F = List.of("Lan", "Hương", "Mai", "Linh", "Trang", "Hà", "Ngân", "Thảo", "Yến", "Vy", "Anh", "Hằng", "Nhung", "Quỳnh");
  static final List<String> ADDRESSES = List.of("Cầu Giấy, Hà Nội", "Đống Đa, Hà Nội", "Thanh Xuân, Hà Nội", "Hà Đông, Hà Nội", "Nam Từ Liêm, Hà Nội",
      "Hoàng Mai, Hà Nội");

  /** Xóa dữ liệu mẫu đã tạo; trả về thông báo. */
  @Transactional
  public String reset() {
    List<String> patientIds = jdbc.queryForList("SELECT \"id\" FROM \"Patient\" WHERE \"phone\" LIKE ?", String.class, PHONE_PREFIX + "%");
    if (patientIds.isEmpty()) return "Không có dữ liệu mẫu để xóa.";
    String in = "SELECT \"id\" FROM \"Patient\" WHERE \"phone\" LIKE ?";
    String visitsIn = "SELECT \"id\" FROM \"Visit\" WHERE \"patientId\" IN (" + in + ")";
    Integer visits = jdbc.queryForObject("SELECT count(*) FROM \"Visit\" WHERE \"patientId\" IN (" + in + ")", Integer.class, PHONE_PREFIX + "%");
    String p = PHONE_PREFIX + "%";
    jdbc.update("DELETE FROM \"PrescriptionItem\" WHERE \"prescriptionId\" IN (SELECT \"id\" FROM \"Prescription\" WHERE \"visitId\" IN (" + visitsIn + "))", p);
    jdbc.update("DELETE FROM \"Prescription\" WHERE \"visitId\" IN (" + visitsIn + ")", p);
    jdbc.update("DELETE FROM \"MedicalRecord\" WHERE \"visitId\" IN (" + visitsIn + ")", p);
    jdbc.update("DELETE FROM \"LabOrder\" WHERE \"visitId\" IN (" + visitsIn + ")", p);
    jdbc.update("DELETE FROM \"Notification\" WHERE \"visitId\" IN (" + visitsIn + ")", p);
    jdbc.update("DELETE FROM \"Visit\" WHERE \"patientId\" IN (" + in + ")", p);
    List<String> scheduleIds = jdbc.queryForList("SELECT \"scheduleId\" FROM \"Appointment\" WHERE \"patientId\" IN (" + in + ")", String.class, p);
    jdbc.update("DELETE FROM \"Appointment\" WHERE \"patientId\" IN (" + in + ")", p);
    for (int i = 0; i < scheduleIds.size(); i += 1000) {
      List<String> batch = scheduleIds.subList(i, Math.min(scheduleIds.size(), i + 1000));
      jdbc.update("DELETE FROM \"Schedule\" WHERE \"id\" = ANY (?)", (Object) batch.toArray(new String[0]));
    }
    jdbc.update("DELETE FROM \"Patient\" WHERE \"phone\" LIKE ?", p);
    return "Đã xóa " + patientIds.size() + " bệnh nhân mẫu, " + visits + " lượt khám mẫu.";
  }

  record Doc(String id, String specialty) {}

  record Pat(String id) {}

  /** Tạo dữ liệu mẫu cho {@code totalDays} ngày trước hôm nay; trả về thông báo. */
  @Transactional
  public String generate(int totalDays, Instant now) {
    Integer existing = jdbc.queryForObject("SELECT count(*) FROM \"Patient\" WHERE \"phone\" LIKE ?", Integer.class, PHONE_PREFIX + "%");
    if (existing != null && existing > 0) return "Đã có dữ liệu lịch sử mẫu. Chạy với --reset để xóa rồi tạo lại.";
    List<Doc> doctors = jdbc.query("SELECT d.\"id\", s.\"name\" FROM \"Doctor\" d JOIN \"Specialty\" s ON s.\"id\" = d.\"specialtyId\" ORDER BY d.\"id\"",
        (rs, i) -> new Doc(rs.getString(1), rs.getString(2)));
    Map<String, String> medId = new HashMap<>();
    Map<String, String> medUnit = new HashMap<>();
    jdbc.query("SELECT \"id\", \"name\", \"unit\" FROM \"Medicine\"", rs -> {
      medId.put(rs.getString(2), rs.getString(1));
      medUnit.put(rs.getString(2), rs.getString(3));
    });
    if (doctors.isEmpty() || medId.isEmpty()) throw new IllegalStateException("Chưa có bác sĩ hoặc danh mục thuốc: chạy lệnh \"seed\" trước.");

    // Bệnh nhân mẫu: 70% người lớn, 30% trẻ em (cho khoa Nhi)
    List<Object[]> patientRows = new ArrayList<>();
    List<Pat> adults = new ArrayList<>();
    List<Pat> children = new ArrayList<>();
    for (int i = 0; i < 260; i++) {
      boolean male = rand() < 0.48;
      boolean child = i % 10 < 3;
      int year = child ? integer(2012, 2024) : integer(1950, 2005);
      String fullName = pick(FAMILY) + " " + pick(male ? MIDDLE_M : MIDDLE_F) + " " + pick(male ? GIVEN_M : GIVEN_F);
      LocalDate dob = LocalDate.of(year, integer(1, 12), integer(1, 28));
      String pid = id();
      patientRows.add(new Object[] {pid, fullName, male ? "MALE" : "FEMALE", dob, PHONE_PREFIX + String.format("%06d", i), pick(ADDRESSES), ts(now)});
      (child ? children : adults).add(new Pat(pid));
    }
    // Một nhóm bệnh nhân quay lại nhiều lần (bệnh mạn tính), phần còn lại khám lẻ
    List<Pat> regulars = adults.subList(0, 40);

    LocalDate today = LocalDate.ofInstant(now, ZoneOffset.ofHours(7));
    LocalDate firstDay = today.minusDays(totalDays);
    Set<LocalDate> busyDays = new HashSet<>(jdbc.queryForList("SELECT DISTINCT \"date\" FROM \"Visit\" WHERE \"date\" >= ?", LocalDate.class, firstDay));
    // Khung giờ đã có lịch thật thì không dùng (mỗi bác sĩ một khung giờ chỉ có một lịch)
    Set<String> taken = new HashSet<>();
    jdbc.query("SELECT \"doctorId\", \"startTime\" FROM \"Schedule\" WHERE \"startTime\" >= ?",
        rs -> {
          taken.add(rs.getString(1) + "@" + rs.getObject(2, LocalDateTime.class).toInstant(ZoneOffset.UTC).toEpochMilli());
        }, ts(at(firstDay, 0)));

    List<Object[]> visits = new ArrayList<>();
    List<Object[]> records = new ArrayList<>();
    List<Object[]> prescriptions = new ArrayList<>();
    List<Object[]> items = new ArrayList<>();
    List<Object[]> labOrders = new ArrayList<>();
    List<Object[]> schedules = new ArrayList<>();
    List<Object[]> appointments = new ArrayList<>();
    double[] loadByWeekday = {1.25, 1.05, 1, 1, 0.95, 0.7, 0}; // thứ Hai … Chủ nhật

    for (int d = totalDays; d >= 1; d--) {
      LocalDate day = today.minusDays(d);
      if (day.getDayOfWeek() == DayOfWeek.SUNDAY || busyDays.contains(day)) continue;
      // Thứ Hai đông nhất, thứ Bảy vắng; tỷ lệ đặt online tăng dần theo thời gian
      double dayLoad = loadByWeekday[day.getDayOfWeek().getValue() - 1];
      double progress = 1 - (double) d / totalDays;
      double onlineShare = 0.22 + 0.26 * progress;

      for (Doc doc : doctors) {
        List<Dx> dxList = DIAGNOSES.getOrDefault(doc.specialty(), DIAGNOSES.get("Nội tổng quát"));
        int n = (int) Math.round(between(7, 13) * dayLoad);
        List<Integer> slots = new ArrayList<>();
        for (int i = 0; i < 16; i++) slots.add(450 + i * 15);
        for (int i = 0; i < 12; i++) slots.add(810 + i * 15);
        slots.removeIf(m -> taken.contains(doc.id() + "@" + at(day, m).toEpochMilli()));
        for (int i = slots.size() - 1; i > 0; i--) {
          int j = (int) Math.floor(rand() * (i + 1));
          Integer t = slots.get(i);
          slots.set(i, slots.get(j));
          slots.set(j, t);
        }
        int[] queue = {0, 0}; // ONLINE, WALK_IN

        for (int k = 0; k < n; k++) {
          boolean online = rand() < onlineShare && !slots.isEmpty();
          Pat patient = doc.specialty().equals("Nhi khoa") ? pick(children) : rand() < 0.3 ? pick(regulars) : pick(adults);
          String visitId = id();
          Instant createdAt;
          Instant calledAt;
          Instant appointmentAt = null;
          String appointmentId = null;

          if (online) {
            int slot = slots.remove(slots.size() - 1);
            appointmentAt = at(day, slot);
            String scheduleId = id();
            appointmentId = id();
            schedules.add(new Object[] {scheduleId, doc.id(), day, ts(appointmentAt), ts(at(day, slot + 15)), true});
            appointments.add(new Object[] {appointmentId, patient.id(), scheduleId, "COMPLETED",
                ts(appointmentAt.minusMillis(Math.round(between(0.3, 6) * DAY)))});
            createdAt = appointmentAt.minusMillis(Math.round(between(3, 28) * MINUTE));
            calledAt = Instant.ofEpochMilli(Math.max(createdAt.toEpochMilli(), appointmentAt.toEpochMilli()) + Math.round(skewed(0, 4, 25) * MINUTE));
          } else {
            // Vãng lai: đông đầu giờ sáng và đầu giờ chiều
            int[][] ranges = {{420, 480}, {480, 600}, {600, 690}, {780, 870}, {870, 990}};
            int[] weights = {3, 5, 2, 3, 2};
            int[] minute = ranges[weighted(weights)];
            createdAt = at(day, between(minute[0], minute[1]));
            double crowd = minute[0] < 600 || (minute[0] >= 780 && minute[0] < 870) ? 1.4 : 0.8;
            calledAt = rand() < 0.04 ? null : createdAt.plusMillis(Math.round(skewed(4, 18 * crowd, 95) * MINUTE));
          }

          String source = online ? "ONLINE" : "WALK_IN";
          int queueNumber = ++queue[online ? 0 : 1];
          if (calledAt == null) {
            visits.add(new Object[] {visitId, patient.id(), doc.id(), day, queueNumber, source, "RECEPTION", "LEFT", null, null, null, null, null, null,
                null, null, ts(createdAt)});
            continue;
          }

          int[] dxWeights = dxList.stream().mapToInt(Dx::weight).toArray();
          Dx dx = dxList.get(weighted(dxWeights));
          boolean longExam = doc.specialty().equals("Răng Hàm Mặt");
          double exam = skewed(longExam ? 10 : 4, longExam ? 20 : 9, longExam ? 45 : 30);
          Instant completedAt = calledAt.plusMillis(Math.round(exam * MINUTE));
          String resultMode = null;
          Instant sentForTestsAt = null;
          Instant resultsReadyAt = null;
          if (dx.lab() != null && rand() < 0.45) {
            resultMode = rand() < 0.6 ? "RETURN" : "ONLINE";
            sentForTestsAt = calledAt.plusMillis(Math.round(between(5, 10) * MINUTE));
            Instant ready = sentForTestsAt.plusMillis(Math.round(skewed(20, 45, 150) * MINUTE));
            if (resultMode.equals("RETURN")) {
              resultsReadyAt = ready;
              completedAt = ready.plusMillis(Math.round(between(10, 35) * MINUTE));
            } else {
              completedAt = ready.plusMillis(Math.round(between(30, 240) * MINUTE));
            }
            labOrders.add(new Object[] {id(), visitId, dx.lab(), "Kết quả trong giới hạn theo dõi", ts(ready), ts(sentForTestsAt)});
          }

          visits.add(new Object[] {visitId, patient.id(), doc.id(), day, queueNumber, source, online ? "QR" : "RECEPTION", "DONE", appointmentId,
              ts(appointmentAt), ts(calledAt), online ? "APPOINTMENT" : "ARRIVAL", resultMode, ts(sentForTestsAt), ts(resultsReadyAt), ts(completedAt),
              ts(createdAt)});
          records.add(new Object[] {id(), visitId, "Khám " + dx.name().toLowerCase(), dx.name(), dx.code(), ts(calledAt), ts(completedAt)});
          List<String> meds = dx.meds().stream().filter(medId::containsKey).toList();
          if (!meds.isEmpty() && rand() < 0.9) {
            String prescriptionId = id();
            prescriptions.add(new Object[] {prescriptionId, visitId, doc.id(), "FINALIZED", ts(completedAt), ts(completedAt)});
            for (String m : meds) {
              int days = integer(3, 7);
              // Chai, tuýp: một đơn thường chỉ một chai; viên, gói: theo số ngày
              int quantity = List.of("chai", "tuýp").contains(medUnit.getOrDefault(m, "")) ? 1 : days * 2;
              items.add(new Object[] {id(), prescriptionId, medId.get(m), quantity, "1", 2, days});
            }
          }
        }

        // Lịch hẹn không đến và lịch bị hủy (không có lượt khám)
        for (String status : List.of("NO_SHOW", "CANCELLED")) {
          long count = Math.round(n * onlineShare * (status.equals("NO_SHOW") ? between(0, 0.22) : between(0, 0.14)));
          for (int k = 0; k < count && !slots.isEmpty(); k++) {
            int slot = slots.remove(slots.size() - 1);
            String scheduleId = id();
            Instant startTime = at(day, slot);
            schedules.add(new Object[] {scheduleId, doc.id(), day, ts(startTime), ts(at(day, slot + 15)), status.equals("NO_SHOW")});
            appointments.add(new Object[] {id(), pick(adults).id(), scheduleId, status, ts(startTime.minusMillis(Math.round(between(0.5, 5) * DAY)))});
          }
        }
      }
    }

    // Ghi theo lô để nhanh
    batch("INSERT INTO \"Patient\" (\"id\", \"fullName\", \"gender\", \"dateOfBirth\", \"phone\", \"address\", \"createdAt\") VALUES (?, ?, ?, ?, ?, ?, ?)",
        patientRows);
    batch("INSERT INTO \"Schedule\" (\"id\", \"doctorId\", \"date\", \"startTime\", \"endTime\", \"isBooked\") VALUES (?, ?, ?, ?, ?, ?)", schedules);
    batch("INSERT INTO \"Appointment\" (\"id\", \"patientId\", \"scheduleId\", \"status\", \"createdAt\") VALUES (?, ?, ?, ?, ?)", appointments);
    batch("INSERT INTO \"Visit\" (\"id\", \"patientId\", \"doctorId\", \"date\", \"queueNumber\", \"source\", \"checkinMethod\", \"status\", "
        + "\"appointmentId\", \"appointmentAt\", \"calledAt\", \"callRule\", \"resultMode\", \"sentForTestsAt\", \"resultsReadyAt\", \"completedAt\", "
        + "\"createdAt\") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", visits);
    batch("INSERT INTO \"MedicalRecord\" (\"id\", \"visitId\", \"symptoms\", \"diagnosis\", \"icdCode\", \"createdAt\", \"updatedAt\") "
        + "VALUES (?, ?, ?, ?, ?, ?, ?)", records);
    batch("INSERT INTO \"LabOrder\" (\"id\", \"visitId\", \"name\", \"resultText\", \"doneAt\", \"createdAt\") VALUES (?, ?, ?, ?, ?, ?)", labOrders);
    batch("INSERT INTO \"Prescription\" (\"id\", \"visitId\", \"doctorId\", \"status\", \"finalizedAt\", \"createdAt\") VALUES (?, ?, ?, ?, ?, ?)",
        prescriptions);
    batch("INSERT INTO \"PrescriptionItem\" (\"id\", \"prescriptionId\", \"medicineId\", \"quantity\", \"dosePerTime\", \"timesPerDay\", \"days\") "
        + "VALUES (?, ?, ?, ?, ?, ?, ?)", items);
    return "Đã tạo dữ liệu mẫu " + totalDays + " ngày: " + patientRows.size() + " bệnh nhân, " + visits.size() + " lượt khám, " + appointments.size()
        + " lịch hẹn.";
  }

  private int weighted(int[] weights) {
    int total = 0;
    for (int w : weights) total += w;
    double r = rand() * total;
    for (int i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  private void batch(String sql, List<Object[]> rows) {
    for (int i = 0; i < rows.size(); i += 1000) jdbc.batchUpdate(sql, rows.subList(i, Math.min(rows.size(), i + 1000)));
  }

  /** Số ngày từ tham số "--days N" (7–366, mặc định 60). */
  static int days(String[] args) {
    for (int i = 0; i < args.length - 1; i++) {
      if (args[i].equals("--days")) {
        try {
          return Math.max(7, Math.min(366, Integer.parseInt(args[i + 1])));
        } catch (NumberFormatException e) {
          return 60;
        }
      }
    }
    return 60;
  }
}
