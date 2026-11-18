package com.clinic.support;

import com.clinic.entity.Doctor;
import com.clinic.entity.Patient;
import com.clinic.entity.Specialty;
import com.clinic.entity.User;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.Role;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.PatientRepository;
import com.clinic.repository.SpecialtyRepository;
import com.clinic.repository.UserRepository;
import com.clinic.security.Passwords;
import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;

/** Tạo dữ liệu mẫu cho test (giống test/fixtures.ts của bản cũ). */
@Component
public class Fixtures {
  public static final String PASSWORD = "123456";
  private static final AtomicInteger COUNTER = new AtomicInteger();
  /** Băm sẵn một lần cho nhanh (bcrypt chậm) */
  private static final String PASSWORD_HASH = Passwords.hash(PASSWORD);

  private final UserRepository users;
  private final SpecialtyRepository specialties;
  private final DoctorRepository doctors;
  private final PatientRepository patients;
  private Api api;

  public Fixtures(UserRepository users, SpecialtyRepository specialties, DoctorRepository doctors, PatientRepository patients) {
    this.users = users;
    this.specialties = specialties;
    this.doctors = doctors;
    this.patients = patients;
  }

  void setApi(Api api) {
    this.api = api;
  }

  /** SĐT không trùng giữa các lần gọi. */
  public static String nextPhone() {
    return String.format("09%08d", COUNTER.incrementAndGet());
  }

  public static int counter() {
    return COUNTER.get();
  }

  /** Tài khoản đã đăng nhập: user, token và (nếu có) bác sĩ / hồ sơ bệnh nhân. */
  public record Login(User user, String token, Doctor doctor, Patient patient) {
    public String auth() {
      return token;
    }
  }

  /** Tạo tài khoản trực tiếp trong CSDL (không qua API) rồi đăng nhập lấy token. */
  public Login createUser(Role role, String fullName) {
    User u = new User();
    u.setFullName(fullName);
    u.setPhone(nextPhone());
    u.setRole(role);
    u.setPasswordHash(PASSWORD_HASH);
    users.saveAndFlush(u);
    return new Login(u, login(u.getPhone()), null, null);
  }

  public Login createUser(Role role) {
    return createUser(role, "Người dùng " + role);
  }

  public String login(String phone) {
    return api.post("/api/auth/login").send(Map.of("phone", phone, "password", PASSWORD)).expect(200).body().get("accessToken").asText();
  }

  public Specialty createSpecialty(String name) {
    Specialty s = new Specialty();
    s.setName(name);
    return specialties.saveAndFlush(s);
  }

  public Specialty createSpecialty() {
    return createSpecialty("Chuyên khoa " + COUNTER.incrementAndGet());
  }

  /** Tạo bác sĩ (kèm tài khoản) và trả về token đăng nhập của bác sĩ đó. */
  public Login createDoctor(String specialtyId) {
    String sid = specialtyId != null ? specialtyId : createSpecialty().getId();
    Login login = createUser(Role.DOCTOR, "Bác sĩ " + COUNTER.get());
    Doctor d = new Doctor();
    d.setUserId(login.user().getId());
    d.setSpecialtyId(sid);
    doctors.saveAndFlush(d);
    return new Login(login.user(), login.token(), d, null);
  }

  public Login createDoctor() {
    return createDoctor(null);
  }

  /** Bệnh nhân có tài khoản app + hồ sơ. */
  public Login createPatient() {
    Login login = createUser(Role.PATIENT, "Bệnh nhân " + COUNTER.get());
    Patient p = new Patient();
    p.setUserId(login.user().getId());
    p.setFullName(login.user().getFullName());
    p.setPhone(login.user().getPhone());
    p.setDateOfBirth(LocalDate.parse("1990-01-01"));
    p.setGender(Gender.FEMALE);
    patients.saveAndFlush(p);
    return new Login(login.user(), login.token(), null, p);
  }
}
