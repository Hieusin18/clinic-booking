package com.clinic.unit;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Patient;
import com.clinic.entity.enums.Gender;
import com.clinic.entity.enums.VisitSource;
import com.clinic.export.ExportVisit;
import com.clinic.export.PrintDoc;
import com.clinic.export.PrintDocBuilder;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Mẫu in")
class PrintDocTest {
  @Test
  @DisplayName("tên thuốc theo hoạt chất, tên thương mại trong ngoặc")
  void medicineLabel() {
    assertThat(PrintDocBuilder.medicineLabel("Hapacol 250", "Paracetamol", "250mg")).isEqualTo("Paracetamol (Hapacol 250) 250mg");
    assertThat(PrintDocBuilder.medicineLabel("Paracetamol", "Paracetamol", "500mg")).isEqualTo("Paracetamol 500mg");
  }

  @Test
  @DisplayName("trẻ dưới 72 tháng: ghi tuổi theo tháng, cân nặng và người đưa trẻ đến khám")
  void youngChild() {
    Patient p = new Patient();
    p.setId("p1234567890abc");
    p.setFullName("Bé An");
    p.setDateOfBirth(LocalDate.parse("2024-02-10"));
    p.setGender(Gender.MALE);
    p.setPhone("0900000009");
    p.setRelativeName("Nguyễn Thị Mẹ");
    MedicalRecord r = new MedicalRecord();
    r.setSymptoms("Sốt");
    r.setTemperature(38.0);
    r.setWeight(12.5);
    r.setDiagnosis("Sốt");
    r.setIcdCode("R50.9");
    ExportVisit v = new ExportVisit("v1", LocalDate.parse("2026-11-06"), 3, VisitSource.WALK_IN, Instant.parse("2026-11-06T02:00:00Z"), p,
        new ExportVisit.Doctor("BS", "Lê Minh Châu", "Nhi khoa"), r, List.of(),
        new ExportVisit.Rx("rx1", "PK001abcdefg-C", null, null, List.of(new ExportVisit.Item(4, "1 gói", 2, 2, null, "Hapacol 250", "Paracetamol", "250mg", "gói"))));
    PrintDoc doc = PrintDocBuilder.build(v, new PrintDocBuilder.Clinic("Phòng khám", "", "", "PK001"), Instant.now(), null);
    PrintDoc.Page rx = doc.pages().get(1);
    List<PrintDoc.Field> fields = rx.blocks().stream().filter(b -> b instanceof PrintDoc.Fields).flatMap(b -> ((PrintDoc.Fields) b).fields().stream()).toList();
    assertThat(fields).contains(new PrintDoc.Field("Tuổi", "32 tháng"));
    assertThat(fields).anyMatch(f -> "12,5 kg".equals(f.value()));
    assertThat(fields).contains(new PrintDoc.Field("Họ tên người đưa trẻ đến khám bệnh, chữa bệnh", "Nguyễn Thị Mẹ"));
    assertThat(rx.blocks()).anyMatch(b -> b instanceof PrintDoc.Medicine m && m.quantity().equals("SL: 04 gói"));
    assertThat(doc.fileName()).isEqualTo("benh-an-BA-20261106-B003");
  }
}
