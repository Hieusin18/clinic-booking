package com.clinic.service;

import com.clinic.dto.schedule.CreateSlotsRequest;
import com.clinic.entity.Appointment;
import com.clinic.entity.Doctor;
import com.clinic.entity.Schedule;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.exception.ApiException;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.ScheduleRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.QueueRules;
import com.clinic.util.VnTime;
import com.clinic.view.AppointmentViews;
import com.clinic.view.Json;
import com.clinic.view.Rows;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Khung giờ khám của bác sĩ: mở ca, xem lịch, xóa khung giờ, giờ trống cho bệnh nhân. */
@Service
public class SchedulesService {
  private static final long MINUTE = 60;

  private final ScheduleRepository schedules;
  private final AppointmentRepository appointments;
  private final DoctorRepository doctors;
  private final JdbcTemplate jdbc;
  private final QueueRules rules;

  public SchedulesService(ScheduleRepository schedules, AppointmentRepository appointments, DoctorRepository doctors, JdbcTemplate jdbc, QueueRules rules) {
    this.schedules = schedules;
    this.appointments = appointments;
    this.doctors = doctors;
    this.jdbc = jdbc;
    this.rules = rules;
  }

  public String doctorIdOf(AuthUser user) {
    return doctors.findByUserId(user.sub()).map(Doctor::getId)
        .orElseThrow(() -> ApiException.forbidden("Tài khoản không gắn với bác sĩ nào"));
  }

  /** Bác sĩ mở hàng loạt khung giờ trong một ca; khung giờ đã có thì bỏ qua. */
  @Transactional
  public Map<String, Object> createSlots(AuthUser user, CreateSlotsRequest dto) {
    String doctorId = doctorIdOf(user);
    String ymd = dto.date().substring(0, 10);
    Instant now = Instant.now();
    if (ymd.compareTo(VnTime.dateString(now)) < 0) throw ApiException.badRequest("Không tạo được khung giờ cho ngày đã qua");
    if (dto.end().compareTo(dto.start()) <= 0) throw ApiException.badRequest("Giờ kết thúc phải sau giờ bắt đầu");

    long startAt = VnTime.dateTime(ymd, dto.start()).toEpochMilli();
    long endAt = VnTime.dateTime(ymd, dto.end()).toEpochMilli();
    long step = dto.slotMinutes() * 60_000L;
    List<Object[]> rows = new ArrayList<>();
    LocalDate date = LocalDate.parse(ymd);
    for (long t = startAt; t + step <= endAt; t += step) {
      if (t <= now.toEpochMilli()) continue; // bỏ các lượt đã qua giờ trong ngày hôm nay
      rows.add(new Object[] {UUID.randomUUID().toString(), doctorId, java.sql.Date.valueOf(date), new Timestamp(t), new Timestamp(t + step)});
    }
    if (rows.isEmpty()) throw ApiException.badRequest("Ca làm việc ngắn hơn một lượt khám hoặc đã qua giờ");

    // Khung giờ trùng (cùng bác sĩ, cùng giờ bắt đầu) thì bỏ qua
    int created = 0;
    for (int n : jdbc.batchUpdate(
        "INSERT INTO \"Schedule\" (\"id\", \"doctorId\", \"date\", \"startTime\", \"endTime\") VALUES (?, ?, ?, ?, ?) "
            + "ON CONFLICT (\"doctorId\", \"startTime\") DO NOTHING", rows)) {
      created += Math.max(n, 0);
    }
    return Json.obj("created", created, "skipped", rows.size() - created);
  }

  /** Lịch làm việc của bác sĩ trong khoảng ngày, kèm bệnh nhân đã đặt. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> mine(AuthUser user, String from, String to) {
    String doctorId = doctorIdOf(user);
    List<Schedule> list = schedules.findRange(doctorId, LocalDate.parse(from.substring(0, 10)), LocalDate.parse(to.substring(0, 10)));
    Map<String, List<Appointment>> byId = list.isEmpty() ? Map.of()
        : appointments.forSchedules(list.stream().map(Schedule::getId).toList(),
            List.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED))
            .stream().collect(Collectors.groupingBy(Appointment::getScheduleId));
    return list.stream().map(s -> {
      Map<String, Object> m = Rows.schedule(s);
      m.put("appointments", byId.getOrDefault(s.getId(), List.of()).stream()
          .map(a -> Json.obj("id", a.getId(), "status", a.getStatus(), "reason", a.getReason(), "patient", AppointmentViews.patientBrief(a.getPatient())))
          .toList());
      return m;
    }).toList();
  }

  @Transactional
  public void remove(AuthUser user, String id) {
    String doctorId = doctorIdOf(user);
    Schedule slot = schedules.findById(id).filter(s -> s.getDoctorId().equals(doctorId))
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy khung giờ"));
    // Chỉ xóa khi chưa ai đặt; câu lệnh có điều kiện để không xóa nhầm khung giờ vừa được đặt
    int count = jdbc.update("DELETE FROM \"Schedule\" s WHERE s.\"id\" = ? AND s.\"isBooked\" = false "
        + "AND NOT EXISTS (SELECT 1 FROM \"Appointment\" a WHERE a.\"scheduleId\" = s.\"id\")", slot.getId());
    if (count == 0) throw ApiException.conflict("Khung giờ đã có người đặt, không xóa được");
  }

  private void ensureActiveDoctor(String doctorId) {
    Doctor d = doctors.findById(doctorId).orElse(null);
    if (d == null || !d.getUser().isActive()) throw ApiException.notFound("Không tìm thấy bác sĩ");
  }

  /** Khung giờ còn trống của một bác sĩ trong ngày (bệnh nhân xem); all = true thì trả cả khung giờ đã có người đặt. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> available(String doctorId, String date, boolean all) {
    ensureActiveDoctor(doctorId);
    Instant now = Instant.now();
    LocalDate day = date != null ? LocalDate.parse(date.substring(0, 10)) : VnTime.today(now);
    return schedules.findDay(doctorId, day).stream()
        .filter(s -> (all || !s.isBooked()) && s.getStartTime().isAfter(now))
        // Kèm khung giờ được check-in để app nhắc ngay khi bệnh nhân chọn giờ
        .map(s -> Json.obj("id", s.getId(), "startTime", s.getStartTime(), "endTime", s.getEndTime(), "isBooked", s.isBooked(),
            "checkinOpensAt", s.getStartTime().minusSeconds(rules.checkinEarlyMinutes() * MINUTE),
            "checkinClosesAt", s.getStartTime().plusSeconds(rules.checkinLateMinutes() * MINUTE)))
        .toList();
  }

  /** Số khung giờ còn trống từng ngày trong vài ngày tới, cho trang hồ sơ bác sĩ. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> availability(String doctorId, Integer days, Instant now) {
    ensureActiveDoctor(doctorId);
    LocalDate first = VnTime.today(now);
    int n = days == null ? 7 : days;
    List<Map<String, Object>> out = new ArrayList<>();
    for (int i = 0; i < n; i++) {
      LocalDate d = first.plusDays(i);
      out.add(Json.obj("date", d.toString(), "free", schedules.countFree(doctorId, d, now)));
    }
    return out;
  }
}
