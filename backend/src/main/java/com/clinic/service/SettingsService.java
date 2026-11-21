package com.clinic.service;

import com.clinic.config.AppEnv;
import com.clinic.entity.ClinicSetting;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.ClinicSettingRepository;
import com.clinic.security.AuthUser;
import com.clinic.view.Json;
import java.time.Instant;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cài đặt phòng khám admin bật/tắt trên web. Chưa đặt thì lấy mặc định từ biến môi trường.
 *
 * <p>{@code vitalsBeforeExam}: bác sĩ bấm "Gọi tiếp" chỉ gọi bệnh nhân đã đo sinh hiệu (mặc định bật; biến môi trường
 * VITALS_BEFORE_EXAM=false để mặc định tắt). Hôm không có điều dưỡng trực thì admin tắt đi.
 */
@Service
public class SettingsService {
  public static final String VITALS_BEFORE_EXAM = "vitalsBeforeExam";
  /** Chỉ nhận khách vãng lai khi bác sĩ có ca và còn thời gian rảnh trong ca */
  public static final String WALK_IN_LIMIT = "walkInLimit";

  private final ClinicSettingRepository settings;
  private final RealtimeService realtime;
  private final boolean vitalsDefault;
  private final boolean walkInDefault;

  public SettingsService(ClinicSettingRepository settings, RealtimeService realtime, AppEnv env) {
    this.settings = settings;
    this.realtime = realtime;
    String raw = env.get("VITALS_BEFORE_EXAM");
    this.vitalsDefault = on(raw);
    this.walkInDefault = on(env.get("WALK_IN_LIMIT"));
  }

  /** Biến môi trường: bỏ trống = bật; "false"/"0" = tắt */
  private static boolean on(String raw) {
    return raw == null || raw.isBlank() || !(raw.trim().equalsIgnoreCase("false") || raw.trim().equals("0"));
  }

  private boolean flag(String key, boolean fallback) {
    return settings.findById(key).map(s -> Boolean.parseBoolean(s.getValue())).orElse(fallback);
  }

  @Transactional(readOnly = true)
  public boolean vitalsBeforeExam() {
    return flag(VITALS_BEFORE_EXAM, vitalsDefault);
  }

  /** Mặc định bật; biến môi trường WALK_IN_LIMIT=false để mặc định tắt */
  @Transactional(readOnly = true)
  public boolean walkInLimit() {
    return flag(WALK_IN_LIMIT, walkInDefault);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> all() {
    return Json.obj(VITALS_BEFORE_EXAM, vitalsBeforeExam(), WALK_IN_LIMIT, walkInLimit());
  }

  @Transactional
  public Map<String, Object> setVitalsBeforeExam(AuthUser admin, boolean on) {
    return set(admin, VITALS_BEFORE_EXAM, on);
  }

  @Transactional
  public Map<String, Object> set(AuthUser admin, String key, boolean on) {
    ClinicSetting s = settings.findById(key).orElseGet(ClinicSetting::new);
    s.setKey(key);
    s.setValue(String.valueOf(on));
    s.setUpdatedById(admin.sub());
    s.setUpdatedAt(Instant.now());
    settings.saveAndFlush(s);
    // Màn hình bác sĩ/điều dưỡng tải lại để đổi nút theo quy trình mới
    realtime.staffChanged();
    return all();
  }
}
