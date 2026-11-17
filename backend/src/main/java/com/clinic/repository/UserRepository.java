package com.clinic.repository;

import com.clinic.entity.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, String> {
  Optional<User> findByPhone(String phone);

  Optional<User> findByEmail(String email);

  /** Tăng phiên bản token: mọi token đã cấp hết hiệu lực. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update User u set u.tokenVersion = u.tokenVersion + 1 where u.id = :id")
  int bumpTokenVersion(@Param("id") String id);
}
