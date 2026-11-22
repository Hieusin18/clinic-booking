package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.Specialty;
import com.clinic.entity.enums.Role;
import com.clinic.support.Fixtures;
import com.clinic.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Quản trị: chuyên khoa, bác sĩ, lễ tân, thuốc")
class AdminTest extends IntegrationTest {
  String admin;

  @BeforeEach
  void loginAdmin() {
    admin = fx.createUser(Role.ADMIN).token();
  }

  static List<String> texts(JsonNode array, String field) {
    List<String> out = new ArrayList<>();
    array.forEach(n -> out.add(n.get(field).asText()));
    return out;
  }

  @Nested
  @DisplayName("Chuyên khoa")
  class Specialties {
    @Test
    @DisplayName("admin thêm, sửa; ai cũng xem được danh sách có phân trang")
    void crud() {
      var created = api.post("/api/specialties").auth(admin).send(Map.of("name", "Nhi khoa")).expect(201);
      api.patch("/api/specialties/" + created.body().get("id").asText()).auth(admin).send(Map.of("description", "Trẻ em")).expect(200);
      api.post("/api/specialties").auth(admin).send(Map.of("name", "Da liễu")).expect(201);
      var page = api.get("/api/specialties?pageSize=1").expect(200).body();
      assertThat(page.get("total").asInt()).isEqualTo(2);
      assertThat(page.get("page").asInt()).isEqualTo(1);
      assertThat(page.get("pageSize").asInt()).isEqualTo(1);
      assertThat(page.get("items")).hasSize(1);
      assertThat(page.at("/items/0/name").asText()).isEqualTo("Da liễu");
    }

    @Test
    @DisplayName("admin nhập triệu chứng thường gặp để gợi ý khoa; bỏ trùng, bỏ dòng trống")
    void symptoms() {
      var created = api.post("/api/specialties").auth(admin).send(Map.of("name", "Tai Mũi Họng", "symptoms", List.of("Đau họng", " Ho ", "Ho", ""))).expect(201).body();
      assertThat(strings(created.get("symptoms"))).containsExactly("Đau họng", "Ho");
      String id = created.get("id").asText();
      api.patch("/api/specialties/" + id).auth(admin).send(Map.of("symptoms", List.of("Ù tai"))).expect(200);
      var page = api.get("/api/specialties").expect(200).body();
      assertThat(strings(page.at("/items/0/symptoms"))).containsExactly("Ù tai");
      // Sửa mô tả không làm mất triệu chứng
      api.patch("/api/specialties/" + id).auth(admin).send(Map.of("description", "Tai, mũi, họng")).expect(200);
      assertThat(strings(api.get("/api/specialties").expect(200).body().at("/items/0/symptoms"))).containsExactly("Ù tai");
      api.patch("/api/specialties/" + id).auth(fx.createUser(Role.RECEPTIONIST).token()).send(Map.of("symptoms", List.of("Ho"))).expect(403);
    }

    static List<String> strings(JsonNode array) {
      List<String> out = new ArrayList<>();
      array.forEach(n -> out.add(n.asText()));
      return out;
    }

    @Test
    @DisplayName("không cho trùng tên (không phân biệt hoa thường)")
    void uniqueName() {
      api.post("/api/specialties").auth(admin).send(Map.of("name", "Nhi khoa")).expect(201);
      api.post("/api/specialties").auth(admin).send(Map.of("name", "NHI KHOA")).expect(409);
    }

    @Test
    @DisplayName("không xóa được chuyên khoa còn bác sĩ, xóa được khi trống")
    void remove() {
      Specialty busy = fx.createSpecialty();
      fx.createDoctor(busy.getId());
      var res = api.delete("/api/specialties/" + busy.getId()).auth(admin).expect(409);
      assertThat(res.body().get("message").asText()).isEqualTo("Không xóa được chuyên khoa còn bác sĩ");
      Specialty empty = fx.createSpecialty();
      api.delete("/api/specialties/" + empty.getId()).auth(admin).expect(204);
    }

    @Test
    @DisplayName("lễ tân không thêm được chuyên khoa")
    void receptionistForbidden() {
      var receptionist = fx.createUser(Role.RECEPTIONIST);
      api.post("/api/specialties").auth(receptionist.token()).send(Map.of("name", "Nội")).expect(403);
    }
  }

  @Nested
  @DisplayName("Bác sĩ")
  class Doctors {
    @Test
    @DisplayName("admin tạo bác sĩ kèm tài khoản; bác sĩ đăng nhập được")
    void createDoctor() {
      Specialty s = fx.createSpecialty();
      String phone = Fixtures.nextPhone();
      var res = api.post("/api/doctors").auth(admin)
          .send(Map.of("fullName", "Lê Văn Bác", "phone", phone, "password", "khambenh24", "specialtyId", s.getId(), "title", "ThS.BS")).expect(201);
      assertThat(res.body().get("title").asText()).isEqualTo("ThS.BS");
      assertThat(res.body().at("/specialty/id").asText()).isEqualTo(s.getId());
      assertThat(res.body().at("/user/fullName").asText()).isEqualTo("Lê Văn Bác");
      assertThat(res.body().at("/user/phone").asText()).isEqualTo(phone);
      var login = api.post("/api/auth/login").send(Map.of("phone", phone, "password", "khambenh24")).expect(200);
      assertThat(login.body().at("/user/role").asText()).isEqualTo("DOCTOR");
    }

    @Test
    @DisplayName("lọc theo chuyên khoa; bác sĩ bị khóa bị ẩn với bệnh nhân nhưng admin vẫn thấy")
    void filterAndLock() {
      Specialty s1 = fx.createSpecialty();
      Specialty s2 = fx.createSpecialty();
      var d1 = fx.createDoctor(s1.getId());
      fx.createDoctor(s2.getId());
      var filtered = api.get("/api/doctors?specialtyId=" + s1.getId()).expect(200).body();
      assertThat(texts(filtered.get("items"), "id")).containsExactly(d1.doctor().getId());

      api.patch("/api/doctors/" + d1.doctor().getId()).auth(admin).send(Map.of("isActive", false)).expect(200);
      assertThat(api.get("/api/doctors").expect(200).body().get("total").asInt()).isEqualTo(1);
      assertThat(api.get("/api/doctors/all").auth(admin).expect(200).body().get("total").asInt()).isEqualTo(2);
      api.post("/api/auth/login").send(Map.of("phone", d1.user().getPhone(), "password", "123456")).expect(401);
    }

    @Test
    @DisplayName("trùng SĐT với tài khoản khác trả 409")
    void duplicatePhone() {
      Specialty s = fx.createSpecialty();
      var existing = fx.createUser(Role.PATIENT);
      api.post("/api/doctors").auth(admin)
          .send(Map.of("fullName", "Ai đó", "phone", existing.user().getPhone(), "password", "khambenh24", "specialtyId", s.getId())).expect(409);
    }
  }

  @Nested
  @DisplayName("Tài khoản lễ tân")
  class Receptionists {
    @Test
    @DisplayName("admin tạo, khóa và đặt lại mật khẩu")
    void lifecycle() {
      String phone = Fixtures.nextPhone();
      var created = api.post("/api/staff/receptionists").auth(admin).send(Map.of("fullName", "Lễ tân Lan", "phone", phone, "password", "tieptan24"))
          .expect(201).body();
      // Mật khẩu ban đầu do admin đặt: phải đổi ở lần đăng nhập đầu
      assertThat(created.get("role").asText()).isEqualTo("RECEPTIONIST");
      assertThat(created.get("isActive").asBoolean()).isTrue();
      assertThat(created.get("mustChangePassword").asBoolean()).isTrue();
      api.post("/api/auth/login").send(Map.of("phone", phone, "password", "tieptan24")).expect(200);

      api.patch("/api/staff/receptionists/" + created.get("id").asText()).auth(admin).send(Map.of("isActive", false)).expect(200);
      api.post("/api/auth/login").send(Map.of("phone", phone, "password", "tieptan24")).expect(401);
      assertThat(api.get("/api/staff/receptionists").auth(admin).expect(200).body().get("total").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("không sửa được tài khoản không phải lễ tân qua API này")
    void onlyReceptionists() {
      var doctor = fx.createUser(Role.DOCTOR);
      api.patch("/api/staff/receptionists/" + doctor.user().getId()).auth(admin).send(Map.of("isActive", false)).expect(404);
    }
  }

  @Nested
  @DisplayName("Danh mục thuốc")
  class Medicines {
    @Test
    @DisplayName("admin thêm thuốc; bác sĩ tìm theo tên hoặc hoạt chất")
    void search() {
      api.post("/api/medicines").auth(admin).send(Map.of("name", "Panadol", "activeIngredient", "Paracetamol", "strength", "500mg", "unit", "viên"))
          .expect(201);
      api.post("/api/medicines").auth(admin).send(Map.of("name", "Augmentin", "activeIngredient", "Amoxicillin", "unit", "viên")).expect(201);
      var doctor = fx.createUser(Role.DOCTOR);
      var byIngredient = api.get("/api/medicines?q=paracetamol").auth(doctor.token()).expect(200).body();
      assertThat(texts(byIngredient.get("items"), "name")).containsExactly("Panadol");
    }

    @Test
    @DisplayName("thuốc ngừng dùng không hiện khi kê đơn, admin vẫn xem được")
    void inactive() {
      var m = api.post("/api/medicines").auth(admin).send(Map.of("name", "Thuốc cũ", "unit", "viên")).expect(201).body();
      api.patch("/api/medicines/" + m.get("id").asText()).auth(admin).send(Map.of("isActive", false)).expect(200);
      var doctor = fx.createUser(Role.DOCTOR);
      assertThat(api.get("/api/medicines").auth(doctor.token()).expect(200).body().get("total").asInt()).isZero();
      assertThat(api.get("/api/medicines?includeInactive=true").auth(admin).expect(200).body().get("total").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("bệnh nhân không xem được danh mục thuốc")
    void patientForbidden() {
      var patient = fx.createUser(Role.PATIENT);
      api.get("/api/medicines").auth(patient.token()).expect(403);
    }
  }
}
