package com.clinic.view;

import com.clinic.entity.Doctor;
import com.clinic.entity.LabOrder;
import com.clinic.entity.Medicine;
import com.clinic.entity.Prescription;
import com.clinic.entity.PrescriptionItem;
import com.clinic.entity.enums.PrescriptionStatus;
import com.clinic.repository.LabFileInfo;
import com.clinic.util.LabFiles;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Đơn thuốc và chỉ định cận lâm sàng trả cho client. */
public final class ClinicalViews {
  private ClinicalViews() {}

  public static Map<String, Object> medicineBrief(Medicine m) {
    return Json.obj("id", m.getId(), "name", m.getName(), "activeIngredient", m.getActiveIngredient(), "strength", m.getStrength(), "unit", m.getUnit());
  }

  public static Map<String, Object> prescription(Prescription p, Doctor doctor, List<PrescriptionItem> items) {
    return Json.obj(
        "id", p.getId(),
        "code", p.getCode(),
        "status", p.getStatus(),
        "advice", p.getAdvice(),
        "createdAt", p.getCreatedAt(),
        "finalizedAt", p.getFinalizedAt(),
        "replacesId", p.getReplacesId(),
        "doctor", Json.obj("id", doctor.getId(), "title", doctor.getTitle(), "user", Json.obj("fullName", doctor.getUser().getFullName())),
        "items", items.stream().map(i -> Json.obj("id", i.getId(), "quantity", i.getQuantity(), "dosePerTime", i.getDosePerTime(),
            "timesPerDay", i.getTimesPerDay(), "days", i.getDays(), "note", i.getNote(), "medicine", medicineBrief(i.getMedicine()))).toList());
  }

  /** Đơn hiệu lực của một lượt khám = đơn hoàn tất mới nhất. */
  public static Prescription current(List<Prescription> list) {
    return list.stream().filter(p -> p.getStatus() == PrescriptionStatus.FINALIZED)
        .max(Comparator.comparing(p -> p.getFinalizedAt() == null ? Instant.EPOCH : p.getFinalizedAt()))
        .orElse(null);
  }

  /**
   * Chỉ định kèm kết quả và tệp (chỉ thông tin tệp, kèm đường dẫn có chữ ký). {@code hideResults} = bệnh nhân xem khi
   * bác sĩ chưa hoàn tất lượt khám: chỉ thấy tên chỉ định, chưa thấy kết quả.
   */
  public static Map<String, Object> labOrder(LabOrder o, List<LabFileInfo> files, String secret, boolean hideResults) {
    long now = System.currentTimeMillis();
    return Json.obj(
        "id", o.getId(),
        "name", o.getName(),
        "note", o.getNote(),
        "resultText", hideResults ? null : o.getResultText(),
        "doneAt", hideResults ? null : o.getDoneAt(),
        "createdAt", o.getCreatedAt(),
        "files", hideResults ? List.of() : files.stream().map(f -> LabFiles.view(f, secret, now)).toList());
  }

  public static List<Map<String, Object>> labOrders(List<LabOrder> orders, Function<String, List<LabFileInfo>> filesOf, String secret, boolean hide) {
    return orders.stream().map(o -> labOrder(o, filesOf.apply(o.getId()), secret, hide)).toList();
  }
}
