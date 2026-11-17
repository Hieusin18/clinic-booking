package com.clinic.service;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.catalog.ReceptionistPatch;
import com.clinic.dto.catalog.ReceptionistRequest;
import com.clinic.entity.User;
import com.clinic.entity.enums.Role;
import com.clinic.exception.ApiException;
import com.clinic.repository.UserRepository;
import com.clinic.security.Passwords;
import com.clinic.view.Rows;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Admin quản lý tài khoản lễ tân */
@Service
public class StaffService {
  private final UserRepository users;
  private final SessionsService sessions;

  public StaffService(UserRepository users, SessionsService sessions) {
    this.users = users;
    this.sessions = sessions;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(PageQuery q) {
    Page<User> page = users.searchByRole(Role.RECEPTIONIST, q.q() == null ? "" : q.q(), q.pageable(Sort.by("fullName")));
    return q.toPage(page.getContent().stream().map(Rows::publicUser).toList(), page.getTotalElements());
  }

  @Transactional
  public Map<String, Object> create(ReceptionistRequest dto) {
    String weak = Passwords.problem(dto.password(), dto.phone());
    if (weak != null) throw ApiException.badRequest(weak);
    if (users.findByPhone(dto.phone()).isPresent()) throw ApiException.conflict("Số điện thoại đã được dùng cho tài khoản khác");
    User u = new User();
    u.setFullName(dto.fullName());
    u.setPhone(dto.phone());
    u.setEmail(dto.email());
    u.setPasswordHash(Passwords.hash(dto.password()));
    u.setRole(Role.RECEPTIONIST);
    // Mật khẩu ban đầu do admin đặt: người dùng phải đổi ở lần đăng nhập đầu
    u.setMustChangePassword(true);
    return Rows.publicUser(users.saveAndFlush(u));
  }

  @Transactional
  public Map<String, Object> update(String id, BodyReader.Patch<ReceptionistPatch> patch) {
    User u = users.findById(id).filter(x -> x.getRole() == Role.RECEPTIONIST)
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy tài khoản lễ tân"));
    ReceptionistPatch dto = patch.value();
    if (dto.fullName() != null) u.setFullName(dto.fullName());
    if (dto.isActive() != null) u.setActive(dto.isActive());
    users.saveAndFlush(u);
    // Khóa tài khoản: máy đang mở không còn nhận cập nhật realtime
    if (Boolean.FALSE.equals(dto.isActive())) sessions.revoke(id);
    return Rows.publicUser(u);
  }
}
