package com.clinic.repository;

import com.clinic.entity.Banner;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BannerRepository extends JpaRepository<Banner, String> {
  /** Banner đang hiện: bật, trong khoảng ngày; thông báo trước, rồi theo thứ tự admin xếp */
  @Query("select b from Banner b where b.active = true and (b.startsAt is null or b.startsAt <= :now) and (b.endsAt is null or b.endsAt > :now) "
      + "order by case when b.kind = 'NOTICE' then 0 else 1 end, b.sortOrder asc, b.createdAt desc")
  List<Banner> showing(@Param("now") Instant now);

  @Query("select b from Banner b order by case when b.kind = 'NOTICE' then 0 else 1 end, b.sortOrder asc, b.createdAt desc")
  List<Banner> allOrdered();
}
