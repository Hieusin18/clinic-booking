package com.clinic.repository;

import com.clinic.entity.Notification;
import com.clinic.entity.enums.NotificationType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, String> {
  @Query("select n from Notification n where n.userId = :userId order by n.createdAt desc")
  List<Notification> latest(@Param("userId") String userId, Pageable page);

  long countByUserIdAndReadAtIsNull(String userId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null and n.type in :types")
  int readAll(@Param("userId") String userId, @Param("types") Collection<NotificationType> types, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null and n.visitId = :visitId and n.type in :types")
  int readOfVisit(@Param("userId") String userId, @Param("visitId") String visitId, @Param("types") Collection<NotificationType> types,
      @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null and n.id in :ids and n.type in :types")
  int readIds(@Param("userId") String userId, @Param("ids") Collection<String> ids, @Param("types") Collection<NotificationType> types,
      @Param("now") Instant now);
}
