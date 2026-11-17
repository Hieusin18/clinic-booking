package com.clinic.dto.visit;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Bệnh án ngoại trú, bố cục theo mẫu bệnh án của Bộ Y tế. Chỉ quá trình bệnh lý và chẩn đoán là bắt buộc.
 * Ô để trống trên form gửi "" hoặc null: coi như không nhập (xem VisitsService.normalize).
 *
 * @param symptoms quá trình bệnh lý (bệnh sử, triệu chứng)
 * @param orders chỉ định cận lâm sàng: xét nghiệm, chẩn đoán hình ảnh…
 * @param secondaryIcdCodes mã ICD-10 bệnh kèm theo, cách nhau bởi dấu phẩy
 * @param followUpDate hẹn tái khám, YYYY-MM-DD
 */
public record RecordRequest(
    @Size(max = 500) String reason,
    @NotNull @Size(min = 2, max = 2000) String symptoms,
    @Size(max = 1000) String personalHistory,
    @Size(max = 1000) String familyHistory,
    @Min(20) @Max(250) Integer pulse,
    @DecimalMin("30") @DecimalMax("45") @Digits(integer = 3, fraction = 1) Double temperature,
    @Min(40) @Max(300) Integer bpSystolic,
    @Min(20) @Max(200) Integer bpDiastolic,
    @Min(5) @Max(80) Integer respiratoryRate,
    @Min(50) @Max(100) Integer spo2,
    @DecimalMin("0.5") @DecimalMax("400") @Digits(integer = 3, fraction = 1) Double weight,
    @DecimalMin("30") @DecimalMax("250") @Digits(integer = 3, fraction = 1) Double height,
    @Size(max = 2000) String generalExam,
    @Size(max = 2000) String organExam,
    @Size(max = 2000) String labSummary,
    @Size(max = 2000) String orders,
    @NotNull @Size(min = 2, max = 1000) String diagnosis,
    @Pattern(regexp = "^[A-Z]\\d{2}(\\.\\d{1,2})?$", message = RecordRequest.ICD_MESSAGE) String icdCode,
    @Size(max = 1000) String secondaryDiagnosis,
    @Pattern(regexp = "^[A-Z]\\d{2}(\\.\\d{1,2})?(\\s*,\\s*[A-Z]\\d{2}(\\.\\d{1,2})?)*$", message = RecordRequest.ICD_MESSAGE) String secondaryIcdCodes,
    @Size(max = 2000) String treatment,
    @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$", message = "Ngày tái khám dạng YYYY-MM-DD") String followUpDate) {
  public static final String ICD_MESSAGE = "Mã ICD-10 không hợp lệ (ví dụ J02.9)";

  /** Chuẩn hóa trước khi kiểm tra: mã ICD bỏ khoảng trắng thừa, viết hoa; ô trống ("" / null) coi như không nhập. */
  public RecordRequest normalized() {
    return new RecordRequest(reason, symptoms, personalHistory, familyHistory, pulse, temperature, bpSystolic, bpDiastolic, respiratoryRate, spo2,
        weight, height, generalExam, organExam, labSummary, orders, diagnosis, icd(icdCode), secondaryDiagnosis, icd(secondaryIcdCodes), treatment,
        followUpDate == null || followUpDate.isEmpty() ? null : followUpDate);
  }

  private static String icd(String s) {
    if (s == null) return null;
    String t = s.trim().toUpperCase();
    return t.isEmpty() ? null : t;
  }

}
