package com.clinic.repository;

import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, String> {
  Optional<User> findByPhone(String phone);

  Optional<User> findByEmail(String email);

  /** Tài khoản theo vai trò, tìm theo tên (không phân biệt hoa thường) hoặc số điện thoại; term rỗng = tất cả. */
  @Query("select u from User u where u.role = :role and (:term = '' or lower(u.fullName) like lower(concat('%', :term, '%')) "
      + "or u.phone like concat('%', :term, '%'))")
  Page<User> searchByRole(@Param("role") Role role, @Param("term") String term, Pageable page);

  /** Tăng phiên bản token: mọi token đã cấp hết hiệu lực. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update User u set u.tokenVersion = u.tokenVersion + 1 where u.id = :id")
  int bumpTokenVersion(@Param("id") String id);

  @Query("select u from User u where u.role = :role and u.active = true order by u.fullName asc")
  List<User> activeByRole(@Param("role") Role role);
}
