package com.clinic.repository;

import com.clinic.entity.Review;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReviewRepository extends JpaRepository<Review, String> {
  Optional<Review> findByVisitId(String visitId);

  /** [số sao, số đánh giá] của bác sĩ, không tính đánh giá admin đã ẩn */
  @Query("select r.rating, count(r) from Review r where r.doctorId = :doctorId and r.hidden = false group by r.rating")
  List<Object[]> distribution(@Param("doctorId") String doctorId);

  /** Góp ý hiển thị công khai trên hồ sơ bác sĩ (có lời góp ý, chưa bị ẩn), mới nhất trước */
  @Query(value = "select r from Review r join fetch r.patient where r.doctorId = :doctorId and r.hidden = false and r.comment is not null order by r.createdAt desc",
      countQuery = "select count(r) from Review r where r.doctorId = :doctorId and r.hidden = false and r.comment is not null")
  Page<Review> publicComments(@Param("doctorId") String doctorId, Pageable page);

  /** Admin: mọi đánh giá, lọc theo bác sĩ (rỗng = tất cả), đã ẩn hay chưa (null = cả hai), số sao tối đa */
  @Query(value = "select r from Review r join fetch r.patient join fetch r.doctor d join fetch d.user where (:doctorId = '' or r.doctorId = :doctorId) "
      + "and (:hidden is null or r.hidden = :hidden) and r.rating <= :maxRating order by r.createdAt desc",
      countQuery = "select count(r) from Review r where (:doctorId = '' or r.doctorId = :doctorId) and (:hidden is null or r.hidden = :hidden) "
          + "and r.rating <= :maxRating")
  Page<Review> search(@Param("doctorId") String doctorId, @Param("hidden") Boolean hidden, @Param("maxRating") int maxRating, Pageable page);
}
