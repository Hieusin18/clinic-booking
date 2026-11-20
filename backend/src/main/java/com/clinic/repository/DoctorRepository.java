package com.clinic.repository;

import com.clinic.entity.Doctor;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DoctorRepository extends JpaRepository<Doctor, String> {
  Optional<Doctor> findByUserId(String userId);

  long countBySpecialtyId(String specialtyId);

  /**
   * Danh sách bác sĩ, sắp theo tên. specialtyId / term rỗng = không lọc; all = true thì gồm cả bác sĩ đã khóa.
   */
  @Query(value = "select d from Doctor d join d.user u where (:sid = '' or d.specialtyId = :sid) and (:all = true or u.active = true) "
      + "and (:term = '' or lower(u.fullName) like lower(concat('%', :term, '%'))) order by u.fullName asc",
      countQuery = "select count(d) from Doctor d join d.user u where (:sid = '' or d.specialtyId = :sid) and (:all = true or u.active = true) "
          + "and (:term = '' or lower(u.fullName) like lower(concat('%', :term, '%')))")
  Page<Doctor> search(@Param("sid") String specialtyId, @Param("term") String term, @Param("all") boolean includeInactive, Pageable page);

  @Query("select d from Doctor d join fetch d.user u join fetch d.specialty where u.active = true order by u.fullName asc")
  List<Doctor> allActive();
}
