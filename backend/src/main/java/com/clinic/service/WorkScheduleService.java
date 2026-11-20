package com.clinic.service;

import com.clinic.dto.shift.ShiftRequest;
import com.clinic.entity.Doctor;
import com.clinic.entity.Schedule;
import com.clinic.entity.StaffShift;
import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.ScheduleRepository;
import com.clinic.repository.StaffShiftRepository;
import com.clinic.repository.UserRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.VnTime;
import com.clinic.view.Json;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lịch làm việc của nhân viên: bác sĩ theo các khung giờ khám đã mở (gộp các khung liền nhau thành ca),
 * lễ tân theo ca trực admin xếp.
 */
@Service
public class WorkScheduleService {
  /** Khoảng xem tối đa (ngày) để một lần tải không quá nặng */
  public static final int MAX_DAYS = 42;

  private final DoctorRepository doctors;
  private final UserRepository users;
  private final ScheduleRepository schedules;
  private final StaffShiftRepository shifts;

  public WorkScheduleService(DoctorRepository doctors, UserRepository users, ScheduleRepository schedules, StaffShiftRepository shifts) {
    this.doctors = doctors;
    this.users = users;
    this.schedules = schedules;
    this.shifts = shifts;
  }

  static LocalDate[] range(String from, String to) {
    LocalDate a = LocalDate.parse(from.substring(0, 10));
    LocalDate b = LocalDate.parse(to.substring(0, 10));
    if (b.isBefore(a)) throw ApiException.badRequest("Ngày kết thúc phải từ ngày bắt đầu trở đi");
    if (ChronoUnit.DAYS.between(a, b) >= MAX_DAYS) throw ApiException.badRequest("Chỉ xem được tối đa " + MAX_DAYS + " ngày một lần");
    return new LocalDate[] {a, b};
  }

  /** Lịch làm việc của toàn bộ bác sĩ và lễ tân đang hoạt động trong khoảng ngày. */
  @Transactional(readOnly = true)
  public Map<String, Object> overview(String from, String to) {
    LocalDate[] r = range(from, to);
    Map<String, List<Schedule>> slots = schedules.findAllRange(r[0], r[1]).stream()
        .collect(Collectors.groupingBy(Schedule::getDoctorId));
    List<Map<String, Object>> doctorRows = doctors.allActive().stream().map(d -> doctorRow(d, slots.getOrDefault(d.getId(), List.of()))).toList();

    Map<String, List<StaffShift>> byUser = shifts.findRange(r[0], r[1]).stream().collect(Collectors.groupingBy(StaffShift::getUserId));
    java.util.function.Function<Role, List<Map<String, Object>>> staff = role -> users.activeByRole(role).stream()
        .map(u -> Json.obj("id", u.getId(), "fullName", u.getFullName(), "phone", u.getPhone(),
            "shifts", byUser.getOrDefault(u.getId(), List.of()).stream().map(WorkScheduleService::shiftView).toList()))
        .toList();
    return Json.obj("from", r[0].toString(), "to", r[1].toString(), "doctors", doctorRows, "receptionists", staff.apply(Role.RECEPTIONIST),
        "nurses", staff.apply(Role.NURSE));
  }

  private static Map<String, Object> doctorRow(Doctor d, List<Schedule> slots) {
    return Json.obj("id", d.getId(), "fullName", d.getUser().getFullName(), "title", d.getTitle(), "room", d.getRoom(),
        "specialty", Json.obj("id", d.getSpecialty().getId(), "name", d.getSpecialty().getName()),
        "shifts", blocks(slots));
  }

  /** Gộp các khung giờ liền nhau (giờ kết thúc khung trước = giờ bắt đầu khung sau, cùng ngày) thành một ca. */
  static List<Map<String, Object>> blocks(List<Schedule> slots) {
    List<Map<String, Object>> out = new ArrayList<>();
    LocalDate date = null;
    Instant start = null;
    Instant end = null;
    int count = 0;
    int booked = 0;
    for (Schedule s : slots) {
      if (start != null && s.getDate().equals(date) && !s.getStartTime().isAfter(end)) {
        if (s.getEndTime().isAfter(end)) end = s.getEndTime();
      } else {
        if (start != null) out.add(block(date, start, end, count, booked));
        date = s.getDate();
        start = s.getStartTime();
        end = s.getEndTime();
        count = 0;
        booked = 0;
      }
      count++;
      if (s.isBooked()) booked++;
    }
    if (start != null) out.add(block(date, start, end, count, booked));
    return out;
  }

  private static Map<String, Object> block(LocalDate date, Instant start, Instant end, int slots, int booked) {
    return Json.obj("date", date.toString(), "startTime", start, "endTime", end, "slots", slots, "booked", booked);
  }

  static Map<String, Object> shiftView(StaffShift s) {
    return Json.obj("id", s.getId(), "userId", s.getUserId(), "date", s.getDate().toString(), "startTime", s.getStartTime(),
        "endTime", s.getEndTime(), "note", s.getNote());
  }

  /** Admin xếp ca trực cho một lễ tân; không cho ca chồng lên ca đã có của cùng người. */
  @Transactional
  public Map<String, Object> create(AuthUser admin, ShiftRequest dto) {
    User u = users.findById(dto.userId()).filter(x -> (x.getRole() == Role.RECEPTIONIST || x.getRole() == Role.NURSE) && x.isActive())
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy lễ tân hoặc điều dưỡng"));
    String ymd = dto.date().substring(0, 10);
    if (ymd.compareTo(VnTime.dateString(Instant.now())) < 0) throw ApiException.badRequest("Không xếp ca cho ngày đã qua");
    if (dto.end().compareTo(dto.start()) <= 0) throw ApiException.badRequest("Giờ kết thúc phải sau giờ bắt đầu");
    Instant start = VnTime.dateTime(ymd, dto.start());
    Instant end = VnTime.dateTime(ymd, dto.end());
    if (shifts.overlaps(u.getId(), start, end)) throw ApiException.conflict("Ca này trùng giờ với ca đã xếp cho " + u.getFullName());
    StaffShift s = new StaffShift();
    s.setUserId(u.getId());
    s.setDate(LocalDate.parse(ymd));
    s.setStartTime(start);
    s.setEndTime(end);
    String note = dto.note() == null ? null : dto.note().strip();
    s.setNote(note == null || note.isEmpty() ? null : note);
    s.setCreatedById(admin.sub());
    return shiftView(shifts.saveAndFlush(s));
  }

  @Transactional
  public void remove(String id) {
    StaffShift s = shifts.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy ca trực"));
    shifts.delete(s);
  }

  /** Lễ tân xem ca trực của mình. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> mine(AuthUser user, String from, String to) {
    LocalDate[] r = range(from, to);
    return shifts.findRange(user.sub(), r[0], r[1]).stream().map(WorkScheduleService::shiftView).toList();
  }
}
