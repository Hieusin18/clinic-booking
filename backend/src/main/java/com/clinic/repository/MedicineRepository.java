package com.clinic.repository;

import com.clinic.entity.Medicine;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MedicineRepository extends JpaRepository<Medicine, String> {
  /** Tìm theo tên hoặc hoạt chất (term null = tất cả); onlyActive = chỉ thuốc đang dùng. */
  @Query("select m from Medicine m where (m.active = true or :all = true) and (:term = '' "
      + "or lower(m.name) like lower(concat('%', :term, '%')) or lower(m.activeIngredient) like lower(concat('%', :term, '%')))")
  Page<Medicine> search(@Param("term") String term, @Param("all") boolean includeInactive, Pageable page);

  @Query("select count(m) from Medicine m where m.id in :ids and m.active = true")
  long countActive(@Param("ids") java.util.Collection<String> ids);
}
