package com.clinic.controller;

import com.clinic.config.AppEnv;
import com.clinic.entity.enums.Role;
import com.clinic.security.Roles;
import com.clinic.util.QrToken;
import com.clinic.view.Json;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mã QR động ở quầy để bệnh nhân quét lấy số (kiểm tra mã ở QueueController). */
@Tag(name = "queue")
@RestController
@RequestMapping("/qr")
public class QrController {
  private final AppEnv env;

  public QrController(AppEnv env) {
    this.env = env;
  }

  /** Màn hình quầy gọi API này mỗi 30 giây để vẽ mã QR mới. Máy ở quầy đăng nhập bằng tài khoản lễ tân. */
  @Roles({Role.RECEPTIONIST, Role.ADMIN})
  @GetMapping("/current")
  public Map<String, Object> current() {
    int ttl = env.getInt("QR_TTL_SECONDS", 60);
    return Json.obj("token", QrToken.create(env.require("CLINIC_ID"), env.require("QR_SECRET"), System.currentTimeMillis()),
        "refreshAfterSeconds", ttl / 2);
  }
}
