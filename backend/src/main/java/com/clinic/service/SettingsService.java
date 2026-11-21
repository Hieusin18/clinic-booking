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

  private final ClinicSettingRepository settings;
  private final RealtimeService realtime;
  private final boolean vitalsDefault;

  public SettingsService(ClinicSettingRepository settings, RealtimeService realtime, AppEnv env) {
    this.settings = settings;
    this.realtime = realtime;
    String raw = env.get("VITALS_BEFORE_EXAM");
    this.vitalsDefault = raw == null || raw.isBlank() || !(raw.trim().equalsIgnoreCase("false") || raw.trim().equals("0"));
  }

  @Transactional(readOnly = true)
  public boolean vitalsBeforeExam() {
    return settings.findById(VITALS_BEFORE_EXAM).map(s -> Boolean.parseBoolean(s.getValue())).orElse(vitalsDefault);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> all() {
    return Json.obj(VITALS_BEFORE_EXAM, vitalsBeforeExam());
  }

  @Transactional
  public Map<String, Object> setVitalsBeforeExam(AuthUser admin, boolean on) {
    ClinicSetting s = settings.findById(VITALS_BEFORE_EXAM).orElseGet(ClinicSetting::new);
    s.setKey(VITALS_BEFORE_EXAM);
    s.setValue(String.valueOf(on));
    s.setUpdatedById(admin.sub());
    s.setUpdatedAt(Instant.now());
    settings.saveAndFlush(s);
    // Màn hình bác sĩ/điều dưỡng tải lại để đổi nút theo quy trình mới
    realtime.staffChanged();
    return all();
  }
}
