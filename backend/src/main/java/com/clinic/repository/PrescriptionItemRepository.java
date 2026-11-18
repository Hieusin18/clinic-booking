package com.clinic.repository;

import com.clinic.entity.PrescriptionItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PrescriptionItemRepository extends JpaRepository<PrescriptionItem, String> {
  List<PrescriptionItem> findByPrescriptionId(String prescriptionId);

  /**
   * Thuốc kê nhiều nhất trong khoảng ngày khám (đơn đã hoàn tất, không tính đơn đã bị thay):
   * [medicineId, số đơn, tổng số lượng].
   */
  @Query("select i.medicineId, count(i), sum(i.quantity) from PrescriptionItem i, Prescription p, Visit v where i.prescriptionId = p.id "
      + "and p.visitId = v.id and p.status = com.clinic.entity.enums.PrescriptionStatus.FINALIZED "
      + "and not exists (select 1 from Prescription r where r.replacesId = p.id) and v.date >= :from and v.date <= :to "
      + "group by i.medicineId order by count(i) desc")
  List<Object[]> topMedicines(@Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to, org.springframework.data.domain.Pageable page);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from PrescriptionItem i where i.prescriptionId = :id")
  int deleteOf(@Param("id") String prescriptionId);
}
