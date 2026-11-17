package com.clinic.service;

import com.clinic.entity.Doctor;
import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Medicine;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.ResultMode;
import com.clinic.entity.enums.VisitSource;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.repository.MedicineRepository;
import com.clinic.repository.PrescriptionItemRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.util.VnTime;
import com.clinic.view.Json;
import java.text.Collator;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Thống kê cho admin (GET /stats/overview?from=YYYY-MM-DD&amp;to=YYYY-MM-DD): tính trực tiếp từ dữ liệu khám.
 * <ul>
 *   <li>Lượt tiếp nhận: mọi phiếu số trong kỳ (theo ngày khám); lượt khám xong: trạng thái DONE.</li>
 *   <li>Thời gian chờ: từ lúc lấy số tới lúc được gọi lần đầu. Với lượt đặt online, tính từ lúc lấy số hoặc giờ hẹn,
 *       mốc nào muộn hơn (đến sớm mà chờ tới giờ hẹn không tính là phải chờ). Dùng trung vị.</li>
 *   <li>Thời gian khám: từ lúc được gọi tới lúc hoàn tất, chỉ các lượt không đi cận lâm sàng.</li>
 *   <li>Thời gian có kết quả CLS: từ lúc gửi đi làm tới lúc có kết quả (chế độ quay lại).</li>
 *   <li>Tỷ lệ không đến: lịch hẹn bị tính "không đến" / lịch hẹn đã tới giờ và không bị hủy.</li>
 *   <li>Bệnh nhân mới: lần khám đầu tiên ở phòng khám rơi vào kỳ này.</li>
 * </ul>
 */
@Service
public class StatsService {
  /** Kỳ thống kê tối đa (ngày) */
  public static final int MAX_RANGE_DAYS = 366;
  private static final Collator VI = Collator.getInstance(Locale.forLanguageTag("vi"));

  private final VisitRepository visits;
  private final AppointmentRepository appointments;
  private final DoctorRepository doctors;
  private final MedicalRecordRepository records;
  private final PrescriptionItemRepository items;
  private final MedicineRepository medicines;

  public StatsService(VisitRepository visits, AppointmentRepository appointments, DoctorRepository doctors, MedicalRecordRepository records,
      PrescriptionItemRepository items, MedicineRepository medicines) {
    this.visits = visits;
    this.appointments = appointments;
    this.doctors = doctors;
    this.records = records;
    this.items = items;
    this.medicines = medicines;
  }

  /** Trung vị (làm tròn 1 chữ số thập phân); null nếu không có số liệu */
  public static Double median(List<Double> values) {
    if (values.isEmpty()) return null;
    List<Double> s = new ArrayList<>(values);
    s.sort(Double::compare);
    int mid = s.size() / 2;
    double m = s.size() % 2 == 1 ? s.get(mid) : (s.get(mid - 1) + s.get(mid)) / 2;
    return Math.round(m * 10) / 10.0;
  }

  /** Tỷ lệ phần trăm, 1 chữ số thập phân; null khi mẫu bằng 0 */
  public static Double percent(long part, long whole) {
    return whole == 0 ? null : Math.round((double) part / whole * 1000) / 10.0;
  }

  /** Các ngày "YYYY-MM-DD" từ from tới to (gồm cả hai đầu) */
  public static List<String> daysBetween(LocalDate from, LocalDate to) {
    List<String> out = new ArrayList<>();
    for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) out.add(d.toString());
    return out;
  }

  private static double minutesBetween(Instant a, Instant b) {
    return (b.toEpochMilli() - a.toEpochMilli()) / 60_000.0;
  }

  private static String doctorLabel(Doctor d) {
    return d.getTitle() != null && !d.getTitle().isEmpty() ? d.getTitle() + " " + d.getUser().getFullName() : d.getUser().getFullName();
  }

  @Transactional(readOnly = true)
  public Map<String, Object> overview(String from, String to, Instant now) {
    LocalDate start;
    LocalDate end;
    try {
      start = LocalDate.parse(from);
      end = LocalDate.parse(to);
    } catch (DateTimeParseException e) {
      throw ApiException.badRequest("Ngày không hợp lệ");
    }
    long days = ChronoUnit.DAYS.between(start, end) + 1;
    if (days < 1) throw ApiException.badRequest("Ngày bắt đầu phải trước ngày kết thúc");
    if (days > MAX_RANGE_DAYS) throw ApiException.badRequest("Chỉ thống kê tối đa " + MAX_RANGE_DAYS + " ngày");

    Map<String, Object> current = period(start, end, now);
    // Kỳ trước cùng độ dài, để so sánh tăng/giảm
    LocalDate prevTo = start.minusDays(1);
    LocalDate prevFrom = start.minusDays(days);
    Map<String, Object> previous = period(prevFrom, prevTo, now);

    return Json.obj(
        "range", Json.obj("from", from, "to", to, "days", days),
        "previousRange", Json.obj("from", prevFrom.toString(), "to", prevTo.toString()),
        "kpis", current.get("kpis"),
        "previous", previous.get("kpis"),
        "daily", current.get("daily"),
        "hourly", current.get("hourly"),
        "doctors", current.get("doctors"),
        "diagnoses", current.get("diagnoses"),
        "medicines", current.get("medicines"),
        "appointments", current.get("appointments"),
        "labs", current.get("labs"));
  }

  private static Double waitOf(Visit v) {
    if (v.getCalledAt() == null) return null;
    Instant from = v.getSource() == VisitSource.ONLINE && v.getAppointmentAt() != null && v.getAppointmentAt().isAfter(v.getCreatedAt())
        ? v.getAppointmentAt() : v.getCreatedAt();
    return Math.max(0, minutesBetween(from, v.getCalledAt()));
  }

  private static Double examOf(Visit v) {
    return v.getStatus() == VisitStatus.DONE && v.getCalledAt() != null && v.getCompletedAt() != null && v.getResultMode() == null
        ? minutesBetween(v.getCalledAt(), v.getCompletedAt()) : null;
  }

  private static List<Double> collect(List<Visit> list, Function<Visit, Double> f) {
    return list.stream().map(f).filter(Objects::nonNull).toList();
  }

  private Map<String, Object> period(LocalDate from, LocalDate to, Instant now) {
    List<Visit> list = visits.inRange(from, to);

    // ---- Chỉ số chính ----
    List<Visit> done = list.stream().filter(v -> v.getStatus() == VisitStatus.DONE).toList();
    Set<String> patientIds = new LinkedHashSet<>(list.stream().map(Visit::getPatientId).toList());
    long newPatients = patientIds.isEmpty() ? 0
        : visits.firstVisitDates(patientIds).stream().filter(r -> r[1] != null && !((LocalDate) r[1]).isBefore(from)).count();
    List<Visit> online = list.stream().filter(v -> v.getSource() == VisitSource.ONLINE).toList();
    List<Visit> walkIn = list.stream().filter(v -> v.getSource() == VisitSource.WALK_IN).toList();

    // ---- Lịch hẹn ----
    Map<AppointmentStatus, Long> appts = new HashMap<>();
    for (Object[] r : appointments.countByStatus(from, to)) appts.put((AppointmentStatus) r[0], (Long) r[1]);
    long apptTotal = appts.values().stream().mapToLong(Long::longValue).sum();
    // Lịch đã tới giờ (không tính lịch tương lai còn chờ)
    long pastNotCancelled = appointments.countPastNotCancelled(from, to, now);

    Map<String, Object> kpis = Json.obj(
        "visits", list.size(),
        "completed", done.size(),
        "left", list.stream().filter(v -> v.getStatus() == VisitStatus.LEFT).count(),
        "patients", patientIds.size(),
        "newPatients", newPatients,
        "onlineShare", percent(online.size(), list.size()),
        "waitMedian", median(collect(list, StatsService::waitOf)),
        "waitOnlineMedian", median(collect(online, StatsService::waitOf)),
        "waitWalkInMedian", median(collect(walkIn, StatsService::waitOf)),
        "examMedian", median(collect(list, StatsService::examOf)),
        "noShowRate", percent(appts.getOrDefault(AppointmentStatus.NO_SHOW, 0L), pastNotCancelled));

    // ---- Theo ngày ----
    Map<String, Map<String, Object>> byDay = new LinkedHashMap<>();
    for (String d : daysBetween(from, to)) byDay.put(d, Json.obj("date", d, "online", 0, "walkIn", 0, "completed", 0));
    for (Visit v : list) {
      Map<String, Object> row = byDay.get(v.getDate().toString());
      if (row == null) continue;
      String key = v.getSource() == VisitSource.ONLINE ? "online" : "walkIn";
      row.put(key, (int) row.get(key) + 1);
      if (v.getStatus() == VisitStatus.DONE) row.put("completed", (int) row.get("completed") + 1);
    }

    // ---- Theo giờ lấy số (giờ Việt Nam) ----
    List<Map<String, Object>> hourly = new ArrayList<>();
    for (int h = 0; h < 24; h++) hourly.add(Json.obj("hour", h, "online", 0, "walkIn", 0));
    for (Visit v : list) {
      Map<String, Object> row = hourly.get(VnTime.hour(v.getCreatedAt()));
      String key = v.getSource() == VisitSource.ONLINE ? "online" : "walkIn";
      row.put(key, (int) row.get(key) + 1);
    }
    List<Integer> busy = hourly.stream().filter(h -> (int) h.get("online") + (int) h.get("walkIn") > 0).map(h -> (int) h.get("hour")).toList();
    List<Map<String, Object>> hourlyTrimmed = busy.isEmpty() ? hourly.subList(7, 18)
        : hourly.subList(Math.min(7, busy.get(0)), Math.max(17, busy.get(busy.size() - 1)) + 1);

    // ---- Theo bác sĩ ----
    Set<String> doctorIds = new LinkedHashSet<>(list.stream().map(Visit::getDoctorId).toList());
    List<Map<String, Object>> doctorRows = doctors.findAllById(doctorIds).stream().map(d -> {
      List<Visit> mine = list.stream().filter(v -> v.getDoctorId().equals(d.getId())).toList();
      return Json.obj(
          "id", d.getId(),
          "name", doctorLabel(d),
          "specialty", d.getSpecialty().getName(),
          "room", d.getRoom(),
          "visits", mine.size(),
          "completed", mine.stream().filter(v -> v.getStatus() == VisitStatus.DONE).count(),
          "waitMedian", median(collect(mine, StatsService::waitOf)),
          "examMedian", median(collect(mine, StatsService::examOf)));
    }).sorted(Comparator.<Map<String, Object>>comparingLong(m -> -((Long) m.get("completed"))).thenComparing(m -> (String) m.get("name"), VI))
        .collect(Collectors.toList());

    // ---- Chẩn đoán thường gặp (theo mã ICD-10, chưa có mã thì theo tên) ----
    Map<String, Map<String, Object>> dx = new LinkedHashMap<>();
    if (!done.isEmpty()) {
      for (MedicalRecord r : records.findByVisitIdIn(done.stream().map(Visit::getId).toList())) {
        if (r.getDiagnosis() == null || r.getDiagnosis().isEmpty()) continue;
        String code = r.getIcdCode() == null || r.getIcdCode().isEmpty() ? null : r.getIcdCode().toUpperCase();
        String key = code != null ? code : r.getDiagnosis().trim().toLowerCase();
        Map<String, Object> row = dx.computeIfAbsent(key, k -> Json.obj("code", code, "name", r.getDiagnosis().trim(), "count", 0));
        row.put("count", (int) row.get("count") + 1);
      }
    }
    List<Map<String, Object>> diagnoses = dx.values().stream()
        .sorted(Comparator.<Map<String, Object>>comparingInt(m -> -((int) m.get("count"))).thenComparing(m -> (String) m.get("name"), VI))
        .limit(8).toList();

    // ---- Thuốc kê nhiều nhất (đơn đã hoàn tất, không tính đơn đã bị thay) ----
    List<Object[]> top = items.topMedicines(from, to, PageRequest.of(0, 8));
    Map<String, Medicine> meds = medicines.findAllById(top.stream().map(r -> (String) r[0]).toList()).stream()
        .collect(Collectors.toMap(Medicine::getId, m -> m));
    List<Map<String, Object>> medicineRows = top.stream().map(r -> {
      Medicine m = meds.get((String) r[0]);
      return Json.obj("name", m == null ? "?" : m.getName(), "unit", m == null ? "" : m.getUnit(), "prescriptions", r[1],
          "quantity", r[2] == null ? 0L : r[2]);
    }).toList();

    // ---- Cận lâm sàng ----
    List<Visit> sent = list.stream().filter(v -> v.getResultMode() != null).toList();
    List<Double> turnaround = sent.stream()
        .filter(v -> v.getResultMode() == ResultMode.RETURN && v.getSentForTestsAt() != null && v.getResultsReadyAt() != null)
        .map(v -> minutesBetween(v.getSentForTestsAt(), v.getResultsReadyAt())).toList();
    Map<String, Object> labs = Json.obj(
        "visitsWithTests", sent.size(),
        "returnMode", sent.stream().filter(v -> v.getResultMode() == ResultMode.RETURN).count(),
        "onlineMode", sent.stream().filter(v -> v.getResultMode() == ResultMode.ONLINE).count(),
        "turnaroundMedian", median(turnaround));

    return Json.obj(
        "kpis", kpis,
        "daily", new ArrayList<>(byDay.values()),
        "hourly", new ArrayList<>(hourlyTrimmed),
        "doctors", doctorRows,
        "diagnoses", diagnoses,
        "medicines", medicineRows,
        "appointments", Json.obj(
            "total", apptTotal,
            "completed", appts.getOrDefault(AppointmentStatus.COMPLETED, 0L),
            "noShow", appts.getOrDefault(AppointmentStatus.NO_SHOW, 0L),
            "cancelled", appts.getOrDefault(AppointmentStatus.CANCELLED, 0L),
            "upcoming", appts.getOrDefault(AppointmentStatus.PENDING, 0L) + appts.getOrDefault(AppointmentStatus.CONFIRMED, 0L)),
        "labs", labs);
  }
}
