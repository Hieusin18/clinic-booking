package com.clinic.repository;

import com.clinic.entity.BannerImage;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BannerImageRepository extends JpaRepository<BannerImage, String> {
  /** [bannerId, updatedAt] để dựng số phiên bản ảnh mà không đọc dữ liệu ảnh */
  @Query("select i.bannerId, i.updatedAt from BannerImage i where i.bannerId in :ids")
  List<Object[]> versions(@Param("ids") Collection<String> ids);

}
