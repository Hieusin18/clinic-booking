package com.clinic.service;

import com.clinic.dto.vitals.VitalsRequest;
import com.clinic.entity.User;
import com.clinic.entity.Visit;
import com.clinic.entity.VisitVitals;
import com.clinic.entity.enums.Role;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.UserRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.repository.VisitVitalsRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.VnTime;
import com.clinic.view.Json;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Điều dưỡng đo sinh hiệu cho bệnh nhân đang chờ khám trong ngày. */
@Service
public class VitalsService {
  private final VisitVitalsRepository vitals;
  private final VisitRepository visits;
  private final UserRepository users;
  private final QueueService queue;
  private final RealtimeService realtime;
  private final DoctorRepository doctors;

  public VitalsService(VisitVitalsRepository vitals, VisitRepository visits, UserRepository users, QueueService queue, RealtimeService realtime,
      DoctorRepository doctors) {
    this.doctors = doctors;
    this.vitals = vitals;
    this.visits = visits;
    this.users = users;
    this.queue = queue;
    this.realtime = realtime;
  }

  private static Map<String, Object> view(VisitVitals v, User by) {
    return Json.obj("pulse", v.getPulse(), "temperature", v.getTemperature(), "bpSystolic", v.getBpSystolic(), "bpDiastolic", v.getBpDiastolic(),
        "respiratoryRate", v.getRespiratoryRate(), "spo2", v.getSpo2(), "weight", v.getWeight(), "height", v.getHeight(), "note", v.getNote(),
        "measuredAt", v.getMeasuredAt(), "measuredBy", by == null ? null : Json.obj("id", by.getId(), "fullName", by.getFullName()));
  }

  /** Gắn sinh hiệu ("vitals", null = chưa đo) vào danh sách phiếu khám đã dựng sẵn (có "id"). */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> attach(List<Map<String, Object>> list) {
    List<String> ids = list.stream().map(m -> (String) m.get("id")).toList();
    if (ids.isEmpty()) return list;
    List<VisitVitals> found = vitals.findByVisitIdIn(ids);
    Set<String> userIds = new HashSet<>();
    found.forEach(v -> {
      if (v.getMeasuredById() != null) userIds.add(v.getMeasuredById());
    });
    Map<String, User> byId = users.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, Function.identity()));
    Map<String, VisitVitals> byVisit = found.stream().collect(Collectors.toMap(VisitVitals::getVisitId, Function.identity()));
    for (Map<String, Object> m : list) {
      VisitVitals v = byVisit.get((String) m.get("id"));
      m.put("vitals", v == null ? null : view(v, v.getMeasuredById() == null ? null : byId.get(v.getMeasuredById())));
    }
    return list;
  }

  /** Sinh hiệu của một lượt khám (null = chưa đo). */
  @Transactional(readOnly = true)
  public Map<String, Object> of(String visitId) {
    return vitals.findByVisitId(visitId).map(v -> view(v, v.getMeasuredById() == null ? null : users.findById(v.getMeasuredById()).orElse(null)))
        .orElse(null);
  }

  /** Bệnh nhân hôm nay (mọi bác sĩ hoặc một bác sĩ) kèm sinh hiệu đã đo. */
  public List<Map<String, Object>> today(String doctorId) {
    return attach(queue.today(doctorId, Instant.now()));
  }

  /** Ghi hoặc sửa sinh hiệu: chỉ lượt khám hôm nay đang chờ hoặc đang khám. */
  @Transactional
  public Map<String, Object> save(AuthUser user, String visitId, VitalsRequest dto) {
    Visit visit = visits.findById(visitId).orElseThrow(() -> ApiException.notFound("Không tìm thấy phiếu khám"));
    // Bác sĩ chỉ ghi cho bệnh nhân của mình; điều dưỡng ghi cho mọi bệnh nhân trong ngày
    if (user.role() == Role.DOCTOR && doctors.findByUserId(user.sub()).filter(d -> d.getId().equals(visit.getDoctorId())).isEmpty()) {
      throw ApiException.notFound("Không tìm thấy phiếu khám");
    }
    if (!visit.getDate().equals(VnTime.today(Instant.now()))) throw ApiException.conflict("Chỉ đo sinh hiệu cho lượt khám hôm nay");
    if (visit.getStatus() != VisitStatus.WAITING && visit.getStatus() != VisitStatus.IN_PROGRESS) {
      throw ApiException.conflict("Bệnh nhân đã khám xong hoặc đã về, không ghi sinh hiệu được");
    }
    if ((dto.bpSystolic() == null) != (dto.bpDiastolic() == null)) throw ApiException.badRequest("Nhập đủ cả huyết áp tâm thu và tâm trương");
    if (dto.bpSystolic() != null && dto.bpSystolic() <= dto.bpDiastolic()) throw ApiException.badRequest("Huyết áp tâm thu phải lớn hơn tâm trương");
    String note = dto.note() == null || dto.note().isBlank() ? null : dto.note().strip();
    boolean empty = dto.pulse() == null && dto.temperature() == null && dto.bpSystolic() == null && dto.respiratoryRate() == null
        && dto.spo2() == null && dto.weight() == null && dto.height() == null;
    if (empty) throw ApiException.badRequest("Nhập ít nhất một chỉ số");
    VisitVitals v = vitals.findByVisitId(visitId).orElseGet(() -> {
      VisitVitals n = new VisitVitals();
      n.setVisitId(visitId);
      return n;
    });
    v.setPulse(dto.pulse());
    v.setTemperature(dto.temperature());
    v.setBpSystolic(dto.bpSystolic());
    v.setBpDiastolic(dto.bpDiastolic());
    v.setRespiratoryRate(dto.respiratoryRate());
    v.setSpo2(dto.spo2());
    v.setWeight(dto.weight());
    v.setHeight(dto.height());
    v.setNote(note);
    v.setMeasuredById(user.sub());
    v.setMeasuredAt(Instant.now());
    vitals.saveAndFlush(v);
    // Bác sĩ đang mở phiếu và màn hình điều dưỡng khác thấy ngay
    realtime.staffChanged();
    return view(v, users.findById(user.sub()).orElse(null));
  }
}
