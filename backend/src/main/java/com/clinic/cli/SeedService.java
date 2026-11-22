package com.clinic.cli;

import com.clinic.entity.Doctor;
import com.clinic.entity.DoctorHistory;
import com.clinic.entity.Medicine;
import com.clinic.entity.Patient;
import com.clinic.entity.Specialty;
import com.clinic.entity.User;
import com.clinic.entity.enums.DoctorHistoryKind;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.Role;
import com.clinic.repository.DoctorHistoryRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.MedicineRepository;
import com.clinic.repository.PatientRepository;
import com.clinic.repository.SpecialtyRepository;
import com.clinic.repository.UserRepository;
import com.clinic.security.Passwords;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dữ liệu mẫu cho phát triển và demo: {@code java -jar app.jar seed}. Chạy lại nhiều lần không bị trùng (theo SĐT / tên).
 * Mọi tài khoản mẫu dùng mật khẩu 123456.
 */
@Service
public class SeedService {
  private final UserRepository users;
  private final PatientRepository patients;
  private final SpecialtyRepository specialties;
  private final DoctorRepository doctors;
  private final DoctorHistoryRepository histories;
  private final MedicineRepository medicines;

  public SeedService(UserRepository users, PatientRepository patients, SpecialtyRepository specialties, DoctorRepository doctors,
      DoctorHistoryRepository histories, MedicineRepository medicines) {
    this.users = users;
    this.patients = patients;
    this.specialties = specialties;
    this.doctors = doctors;
    this.histories = histories;
    this.medicines = medicines;
  }

  private User upsertUser(String fullName, String phone, Role role, String passwordHash) {
    return users.findByPhone(phone).orElseGet(() -> {
      User u = new User();
      u.setFullName(fullName);
      u.setPhone(phone);
      u.setRole(role);
      u.setPasswordHash(passwordHash);
      return users.saveAndFlush(u);
    });
  }

  @Transactional
  public void run() {
    String hash = Passwords.hash("123456");
    upsertUser("Quản trị viên", "0900000001", Role.ADMIN, hash);
    upsertUser("Lễ tân Mai", "0900000002", Role.RECEPTIONIST, hash);
    upsertUser("Điều dưỡng Lan", "0900000004", Role.NURSE, hash);
    User patientUser = upsertUser("Đỗ Hữu Phúc", "0900000003", Role.PATIENT, hash);
    if (patients.findByPhone("0900000003").isEmpty()) {
      Patient p = new Patient();
      p.setUserId(patientUser.getId());
      p.setFullName("Đỗ Hữu Phúc");
      p.setPhone("0900000003");
      p.setDateOfBirth(LocalDate.parse("1995-04-12"));
      p.setGender(Gender.MALE);
      p.setAddress("Cầu Giấy, Hà Nội");
      p.setAllergies("Penicillin");
      patients.saveAndFlush(p);
    }

    for (SeedData.Specialty s : SeedData.SPECIALTIES) {
      // Chuyên khoa đã có từ trước nhưng chưa có triệu chứng: bổ sung để gợi ý khoa hoạt động
      for (Specialty old : specialties.findByNameIgnoreCase(s.name())) {
        if (old.getSymptoms() == null) {
          old.setSymptoms(String.join("\n", s.symptoms()));
          specialties.saveAndFlush(old);
        }
      }
      if (specialties.findByNameIgnoreCase(s.name()).isEmpty()) {
        Specialty e = new Specialty();
        e.setName(s.name());
        e.setDescription(s.description());
        e.setSymptoms(String.join("\n", s.symptoms()));
        specialties.saveAndFlush(e);
      }
    }

    int index = 0;
    for (SeedData.Doctor d : SeedData.DOCTORS) {
      index++;
      User user = upsertUser(d.fullName(), d.phone(), Role.DOCTOR, hash);
      Specialty specialty = specialties.findByNameIgnoreCase(d.specialty()).get(0);
      Doctor doctor = doctors.findByUserId(user.getId()).orElseGet(() -> {
        Doctor n = new Doctor();
        n.setUserId(user.getId());
        n.setSpecialtyId(specialty.getId());
        n.setTitle(d.title());
        return doctors.saveAndFlush(n);
      });
      // Phòng khám mẫu: bác sĩ thứ n ở "Phòng n" (không ghi đè phòng admin đã đặt)
      if (doctor.getRoom() == null) doctor.setRoom("Phòng " + index);
      // Chỉ điền hồ sơ mẫu khi bác sĩ chưa có quá trình công tác (không ghi đè dữ liệu đã sửa)
      if (histories.findByDoctorId(doctor.getId()).isEmpty()) {
        if (doctor.getBio() == null) doctor.setBio(d.bio());
        doctor.setPracticeSince(d.practiceSince());
        doctor.setExpertise(String.join("\n", d.expertise()));
        addSteps(doctor.getId(), DoctorHistoryKind.EDUCATION, d.education());
        addSteps(doctor.getId(), DoctorHistoryKind.WORK, d.career());
      }
      doctors.saveAndFlush(doctor);
    }

    for (SeedData.Medicine m : SeedData.MEDICINES) {
      boolean exists = medicines.findAll().stream().anyMatch(x -> x.getName().equals(m.name()) && m.strength().equals(x.getStrength()));
      if (!exists) {
        Medicine e = new Medicine();
        e.setName(m.name());
        e.setActiveIngredient(m.activeIngredient());
        e.setStrength(m.strength());
        e.setUnit(m.unit());
        medicines.saveAndFlush(e);
      }
    }
  }

  private void addSteps(String doctorId, DoctorHistoryKind kind, java.util.List<SeedData.Step> steps) {
    for (SeedData.Step s : steps) {
      DoctorHistory h = new DoctorHistory();
      h.setDoctorId(doctorId);
      h.setKind(kind);
      h.setFromYear(s.fromYear());
      h.setToYear(s.toYear());
      h.setTitle(s.title());
      h.setPlace(s.place());
      histories.save(h);
    }
  }
}
