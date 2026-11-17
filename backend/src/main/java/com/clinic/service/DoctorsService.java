package com.clinic.service;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.doctor.CreateDoctorRequest;
import com.clinic.dto.doctor.DoctorPatch;
import com.clinic.dto.doctor.HistoryEntry;
import com.clinic.entity.Doctor;
import com.clinic.entity.DoctorAvatar;
import com.clinic.entity.DoctorHistory;
import com.clinic.entity.User;
import com.clinic.entity.enums.DoctorHistoryKind;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.DoctorAvatarRepository;
import com.clinic.repository.DoctorHistoryRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.ScheduleRepository;
import com.clinic.repository.SpecialtyRepository;
import com.clinic.repository.UserRepository;
import com.clinic.security.AuthUser;
import com.clinic.security.Passwords;
import com.clinic.util.DoctorProfile;
import com.clinic.util.VnTime;
import com.clinic.view.Json;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Danh sách và hồ sơ bác sĩ, tài khoản bác sĩ (admin), ảnh đại diện. */
@Service
public class DoctorsService {
  private final DoctorRepository doctors;
  private final DoctorHistoryRepository histories;
  private final DoctorAvatarRepository avatars;
  private final ScheduleRepository schedules;
  private final SpecialtyRepository specialties;
  private final UserRepository users;
  private final SessionsService sessions;

  public DoctorsService(DoctorRepository doctors, DoctorHistoryRepository histories, DoctorAvatarRepository avatars, ScheduleRepository schedules,
      SpecialtyRepository specialties, UserRepository users, SessionsService sessions) {
    this.doctors = doctors;
    this.histories = histories;
    this.avatars = avatars;
    this.schedules = schedules;
    this.specialties = specialties;
    this.users = users;
    this.sessions = sessions;
  }

  /** Ảnh đại diện để trả về: dữ liệu và kiểu. */
  public record Avatar(byte[] data, String mimeType) {}

  /**
   * Thông tin công khai (không có SĐT, email; API danh sách bác sĩ không cần đăng nhập). Admin thấy thêm tài khoản.
   * Thế mạnh trả dạng mảng; ảnh thành số phiên bản để tránh cache cũ.
   */
  private Map<String, Object> present(Doctor d, boolean forAdmin, Instant now) {
    User u = d.getUser();
    Instant avatarAt = avatars.updatedAt(d.getId());
    return Json.obj(
        "id", d.getId(),
        "title", d.getTitle(),
        "bio", d.getBio(),
        "room", d.getRoom(),
        "practiceSince", d.getPracticeSince(),
        "specialty", Json.obj("id", d.getSpecialty().getId(), "name", d.getSpecialty().getName()),
        "user", forAdmin
            ? Json.obj("id", u.getId(), "fullName", u.getFullName(), "phone", u.getPhone(), "email", u.getEmail(), "isActive", u.isActive())
            : Json.obj("fullName", u.getFullName()),
        "expertise", DoctorProfile.splitExpertise(d.getExpertise()),
        "experienceYears", DoctorProfile.experienceYears(d.getPracticeSince(), now),
        // Thời điểm cập nhật ảnh (ms); null = chưa có ảnh. Ảnh ở GET /doctors/:id/avatar?v=<số này>
        "avatarVersion", avatarAt == null ? null : avatarAt.toEpochMilli());
  }

  private Map<String, Object> withHistory(Doctor d, boolean forAdmin) {
    Map<String, Object> out = present(d, forAdmin, Instant.now());
    List<DoctorHistory> all = histories.findByDoctorId(d.getId());
    out.put("education", pick(all, DoctorHistoryKind.EDUCATION));
    out.put("career", pick(all, DoctorHistoryKind.WORK));
    return out;
  }

  private static List<Map<String, Object>> pick(List<DoctorHistory> all, DoctorHistoryKind kind) {
    List<DoctorHistory> list = all.stream().filter(h -> h.getKind() == kind).toList();
    return DoctorProfile.newestFirst(list, DoctorHistory::getFromYear, DoctorHistory::getToYear).stream()
        .map(h -> Json.obj("id", h.getId(), "fromYear", h.getFromYear(), "toYear", h.getToYear(), "title", h.getTitle(), "place", h.getPlace()))
        .toList();
  }

  /** Bệnh nhân chỉ thấy bác sĩ đang hoạt động; admin thấy tất cả và cả tài khoản đăng nhập. */
  @Transactional(readOnly = true)
  public Map<String, Object> list(PageQuery q, String specialtyId, boolean forAdmin) {
    Instant now = Instant.now();
    Page<Doctor> page = doctors.search(specialtyId == null ? "" : specialtyId, q.q() == null ? "" : q.q(), forAdmin,
        PageRequest.of(q.pageOrDefault() - 1, q.sizeOrDefault()));
    List<Map<String, Object>> items = new ArrayList<>();
    for (Doctor d : page.getContent()) {
      Map<String, Object> m = present(d, forAdmin, now);
      // Số khung giờ còn trống hôm nay
      m.put("freeToday", schedules.countFree(d.getId(), VnTime.today(now), now));
      // "Chức vụ · Nơi công tác" của việc đang làm; null = chưa cập nhật
      m.put("currentPosition", histories.findFirstByDoctorIdAndKindAndToYearIsNullOrderByFromYearDesc(d.getId(), DoctorHistoryKind.WORK)
          .map(h -> h.getTitle() + " · " + h.getPlace()).orElse(null));
      items.add(m);
    }
    return q.toPage(items, page.getTotalElements());
  }

  /** Hồ sơ đầy đủ cho bệnh nhân xem trước khi đặt lịch (chỉ bác sĩ đang hoạt động). */
  @Transactional(readOnly = true)
  public Map<String, Object> profile(String id) {
    Doctor d = doctors.findById(id).filter(x -> x.getUser().isActive()).orElseThrow(() -> ApiException.notFound("Không tìm thấy bác sĩ"));
    return withHistory(d, false);
  }

  /** Hồ sơ kèm tài khoản, cho admin sửa (kể cả bác sĩ đã khóa). */
  @Transactional(readOnly = true)
  public Map<String, Object> full(String id) {
    Doctor d = doctors.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy bác sĩ"));
    return withHistory(d, true);
  }

  @Transactional
  public Map<String, Object> create(CreateDoctorRequest dto) {
    String weak = Passwords.problem(dto.password(), dto.phone());
    if (weak != null) throw ApiException.badRequest(weak);
    ensureSpecialty(dto.specialtyId());
    if (users.findByPhone(dto.phone()).isPresent()) throw ApiException.conflict("Số điện thoại đã được dùng cho tài khoản khác");
    User u = new User();
    u.setFullName(dto.fullName());
    u.setPhone(dto.phone());
    u.setEmail(dto.email());
    u.setPasswordHash(Passwords.hash(dto.password()));
    u.setRole(Role.DOCTOR);
    // Mật khẩu ban đầu do admin đặt: bác sĩ phải đổi ở lần đăng nhập đầu
    u.setMustChangePassword(true);
    users.saveAndFlush(u);
    Doctor d = new Doctor();
    d.setTitle(dto.title());
    d.setBio(dto.bio());
    d.setRoom(blankToNull(dto.room()));
    d.setSpecialtyId(dto.specialtyId());
    d.setUserId(u.getId());
    d.setUser(u);
    d.setSpecialty(specialties.getReferenceById(dto.specialtyId()));
    doctors.saveAndFlush(d);
    return present(d, true, Instant.now());
  }

  private static String blankToNull(String s) {
    if (s == null) return null;
    String t = s.trim();
    return t.isEmpty() ? null : t;
  }

  /** Admin sửa tài khoản và hồ sơ. */
  @Transactional
  public Map<String, Object> update(String id, BodyReader.Patch<DoctorPatch> patch) {
    Doctor d = doctors.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy bác sĩ"));
    DoctorPatch dto = patch.value();
    if (dto.specialtyId() != null && !dto.specialtyId().isEmpty()) ensureSpecialty(dto.specialtyId());
    if (dto.title() != null) d.setTitle(dto.title());
    if (dto.room() != null) d.setRoom(blankToNull(dto.room()));
    if (dto.specialtyId() != null && !dto.specialtyId().isEmpty()) d.setSpecialtyId(dto.specialtyId());
    User u = d.getUser();
    if (dto.fullName() != null) u.setFullName(dto.fullName());
    if (dto.isActive() != null) u.setActive(dto.isActive());
    users.save(u);
    saveProfile(d, patch);
    // Khóa tài khoản: máy đang mở không còn nhận cập nhật realtime
    if (Boolean.FALSE.equals(dto.isActive())) sessions.revoke(d.getUserId());
    return full(id);
  }

  /** Bác sĩ tự sửa phần hồ sơ (không đổi được tên, học vị, chuyên khoa, trạng thái tài khoản). */
  @Transactional
  public Map<String, Object> updateMine(AuthUser user, BodyReader.Patch<DoctorPatch> patch) {
    Doctor d = doctors.findById(doctorIdOf(user)).orElseThrow();
    saveProfile(d, patch);
    return full(d.getId());
  }

  @Transactional(readOnly = true)
  public Map<String, Object> mine(AuthUser user) {
    return full(doctorIdOf(user));
  }

  private void saveProfile(Doctor d, BodyReader.Patch<DoctorPatch> patch) {
    DoctorPatch dto = patch.value();
    List<HistoryEntry> entries = new ArrayList<>();
    if (dto.education() != null) entries.addAll(dto.education());
    if (dto.career() != null) entries.addAll(dto.career());
    DoctorProfile.checkYears(dto.practiceSince(), entries, Instant.now());
    if (dto.bio() != null) d.setBio(dto.bio());
    if (patch.has("practiceSince")) d.setPracticeSince(dto.practiceSince());
    if (dto.expertise() != null) d.setExpertise(DoctorProfile.joinExpertise(dto.expertise()));
    doctors.saveAndFlush(d);
    replace(d.getId(), DoctorHistoryKind.EDUCATION, dto.education());
    replace(d.getId(), DoctorHistoryKind.WORK, dto.career());
  }

  private void replace(String doctorId, DoctorHistoryKind kind, List<HistoryEntry> list) {
    if (list == null) return;
    histories.deleteKind(doctorId, kind);
    for (HistoryEntry e : list) {
      DoctorHistory h = new DoctorHistory();
      h.setDoctorId(doctorId);
      h.setKind(kind);
      h.setFromYear(e.fromYear());
      h.setToYear(e.toYear());
      h.setTitle(e.title().trim());
      h.setPlace(e.place().trim());
      histories.save(h);
    }
    histories.flush();
  }

  @Transactional
  public Map<String, Object> setAvatar(String id, byte[] file) {
    if (file == null) throw ApiException.badRequest("Chưa chọn ảnh");
    if (file.length > DoctorProfile.AVATAR_MAX_BYTES) throw ApiException.badRequest("Ảnh tối đa 2 MB");
    String mimeType = DoctorProfile.detectImage(file);
    if (mimeType == null) throw ApiException.badRequest("Ảnh phải là JPG, PNG hoặc WebP");
    if (!doctors.existsById(id)) throw ApiException.notFound("Không tìm thấy bác sĩ");
    DoctorAvatar a = avatars.findById(id).orElseGet(DoctorAvatar::new);
    a.setDoctorId(id);
    a.setData(file);
    a.setMimeType(mimeType);
    a.setUpdatedAt(Instant.now());
    avatars.saveAndFlush(a);
    return full(id);
  }

  @Transactional
  public Map<String, Object> removeAvatar(String id) {
    avatars.findById(id).ifPresent(avatars::delete);
    avatars.flush();
    return full(id);
  }

  @Transactional(readOnly = true)
  public Avatar avatar(String id) {
    DoctorAvatar a = avatars.findById(id).orElse(null);
    Doctor d = a == null ? null : doctors.findById(id).orElse(null);
    if (a == null || d == null || !d.getUser().isActive()) throw ApiException.notFound("Bác sĩ chưa có ảnh");
    return new Avatar(a.getData(), a.getMimeType());
  }

  @Transactional(readOnly = true)
  public String doctorIdOf(AuthUser user) {
    return doctors.findByUserId(user.sub()).map(Doctor::getId)
        .orElseThrow(() -> ApiException.forbidden("Tài khoản không gắn với bác sĩ nào"));
  }

  private void ensureSpecialty(String id) {
    if (!specialties.existsById(id)) throw ApiException.notFound("Không tìm thấy chuyên khoa");
  }
}
