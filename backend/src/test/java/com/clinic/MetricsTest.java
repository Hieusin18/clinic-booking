package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.enums.Role;
import com.clinic.support.IntegrationTest;
import java.util.Arrays;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Số liệu cho Prometheus (/api/metrics)")
class MetricsTest extends IntegrationTest {
  /** Giá trị của một dòng số liệu dạng `ten{nhan} 3` trong văn bản Prometheus. */
  static double value(String text, String regex) {
    Pattern p = Pattern.compile(regex);
    return Arrays.stream(text.split("\n")).filter(l -> p.matcher(l).find()).findFirst()
        .map(l -> Double.parseDouble(l.trim().split("\\s+")[l.trim().split("\\s+").length - 1])).orElse(0.0);
  }

  @Test
  @DisplayName("không cần đăng nhập, trả định dạng text của Prometheus kèm số liệu JVM")
  void format() {
    var res = api.get("/api/metrics").expect(200);
    assertThat(res.header("Content-Type")).contains("text/plain");
    assertThat(res.text()).contains("process_cpu_seconds_total").contains("jvm_memory_used_bytes").contains("process_start_time_seconds");
  }

  @Test
  @DisplayName("đếm request theo mẫu đường dẫn (không theo id thật) và mã trạng thái")
  void routes() {
    api.get("/api/health").expect(200);
    api.get("/api/doctors/khong-ton-tai").expect(404);
    String text = api.get("/api/metrics").expect(200).text();
    assertThat(value(text, "^http_requests_total\\{.*route=\"/api/health\".*status=\"200\"")).isGreaterThanOrEqualTo(1);
    assertThat(text).containsPattern("http_requests_total\\{[^}]*route=\"/api/doctors/:id\"[^}]*status=\"404\"");
    assertThat(text).doesNotContain("khong-ton-tai");
    api.get("/api/khong-co-api-nay/123").expect(404);
    String after = api.get("/api/metrics").expect(200).text();
    assertThat(after).containsPattern("http_requests_total\\{[^}]*route=\"unmatched\"[^}]*status=\"404\"");
    assertThat(after).doesNotContain("khong-co-api-nay");
    assertThat(text).containsPattern("http_request_duration_seconds_bucket\\{[^}]*route=\"/api/health\"");
  }

  @Test
  @DisplayName("đếm lịch hẹn đặt thành công và phiếu số được cấp")
  void business() {
    String before = api.get("/api/metrics").call().text();
    double booked0 = value(before, "^clinic_appointments_booked_total");
    double walkIn0 = value(before, "^clinic_queue_tickets_total\\{.*source=\"WALK_IN\"");

    var doctor = fx.createDoctor();
    var patient = fx.createPatient();
    api.post("/api/schedules/bulk").auth(doctor.token()).send(Map.of("date", day(1), "start", "08:00", "end", "08:30", "slotMinutes", 15)).expect(201);
    var slots = api.get("/api/doctors/" + doctor.doctor().getId() + "/schedules?date=" + day(1)).expect(200).body();
    api.post("/api/appointments").auth(patient.token()).send(Map.of("scheduleId", slots.at("/0/id").asText())).expect(201);

    var reception = fx.createUser(Role.RECEPTIONIST);
    api.post("/api/queue/tickets").auth(reception.token()).send(Map.of("patientId", patient.patient().getId(), "doctorId", doctor.doctor().getId()))
        .expect(201);

    String after = api.get("/api/metrics").call().text();
    assertThat(value(after, "^clinic_appointments_booked_total")).isEqualTo(booked0 + 1);
    assertThat(value(after, "^clinic_queue_tickets_total\\{.*source=\"WALK_IN\"")).isEqualTo(walkIn0 + 1);
  }
}
