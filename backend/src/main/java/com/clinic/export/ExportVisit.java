package com.clinic.export;

import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Patient;
import com.clinic.entity.enums.VisitSource;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Dữ liệu một lượt khám để in bệnh án và đơn thuốc.
 *
 * @param patient hồ sơ (thông tin cá nhân có thể đã bị che, xem VisitsService)
 * @param labOrders chỉ định cận lâm sàng; kết quả và tệp chỉ có khi được phép xem
 */
public record ExportVisit(
    String id,
    LocalDate date,
    int queueNumber,
    VisitSource source,
    Instant createdAt,
    Patient patient,
    Doctor doctor,
    MedicalRecord record,
    List<Lab> labOrders,
    Rx prescription) {

  /** Bác sĩ: học vị, họ tên, chuyên khoa. */
  public record Doctor(String title, String fullName, String specialty) {}

  /** Một chỉ định cận lâm sàng. */
  public record Lab(String name, String note, String resultText, Instant doneAt, List<File> files) {}

  /** Tệp kết quả. */
  public record File(String fileName, String mimeType, byte[] data) {}

  /** Đơn thuốc. */
  public record Rx(String id, String code, String advice, Instant finalizedAt, List<Item> items) {}

  /** Một dòng thuốc. */
  public record Item(int quantity, String dosePerTime, int timesPerDay, int days, String note, String name, String activeIngredient, String strength,
      String unit) {}
}
