package com.clinic.repository;

import com.clinic.entity.PushToken;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PushTokenRepository extends JpaRepository<PushToken, String> {
  List<PushToken> findByUserId(String userId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from PushToken t where t.userId = :userId")
  int deleteAllOfUser(@Param("userId") String userId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from PushToken t where t.userId = :userId and t.token <> :keep")
  int deleteAllOfUserExcept(@Param("userId") String userId, @Param("keep") String keep);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from PushToken t where t.token in :tokens")
  int deleteTokens(@Param("tokens") List<String> tokens);
}
