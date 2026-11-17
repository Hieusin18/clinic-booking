package com.clinic.repository;

import com.clinic.entity.LabFile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LabFileRepository extends JpaRepository<LabFile, String> {
  /** Danh sách tệp của các chỉ định (không đọc dữ liệu tệp), theo thứ tự tải lên. */
  @Query("select new com.clinic.repository.LabFileInfo(f.id, f.labOrderId, f.fileName, f.mimeType, f.size, f.createdAt) "
      + "from LabFile f where f.labOrderId in :orderIds order by f.createdAt asc")
  List<LabFileInfo> infoOf(@Param("orderIds") Collection<String> orderIds);

  long countByLabOrderId(String labOrderId);

  /** Đủ dữ liệu tệp (để in kèm ảnh vào bệnh án). */
  List<LabFile> findByLabOrderIdOrderByCreatedAtAsc(String labOrderId);
}
