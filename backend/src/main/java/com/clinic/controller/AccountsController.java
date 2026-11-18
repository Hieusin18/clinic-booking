package com.clinic.controller;

import com.clinic.dto.Ids;
import com.clinic.entity.enums.Role;
import com.clinic.security.AuthUser;
import com.clinic.security.CurrentUser;
import com.clinic.security.Roles;
import com.clinic.service.AccountsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "accounts")
@RestController
@RequestMapping("/users")
public class AccountsController {
  private final AccountsService accounts;

  public AccountsController(AccountsService accounts) {
    this.accounts = accounts;
  }

  /** Tạo mật khẩu tạm cho bác sĩ / lễ tân (chỉ trả về một lần) */
  @Roles(Role.ADMIN)
  @PostMapping("/{id}/reset-password")
  public Map<String, Object> reset(@CurrentUser AuthUser admin, @PathVariable String id) {
    return accounts.resetPassword(admin, Ids.uuid(id));
  }
}
