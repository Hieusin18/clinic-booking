package com.clinic.service;

import com.clinic.entity.MedicalRecord;
import com.clinic.entity.MedicalRecordRevision;
import com.clinic.entity.Prescription;
import com.clinic.entity.User;
import com.clinic.entity.enums.PrescriptionStatus;
import com.clinic.repository.MedicalRecordRevisionRepository;
import com.clinic.repository.PrescriptionRepository;
import com.clinic.repository.UserRepository;
import com.clinic.view.Json;
import com.clinic.view.Rows;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.NullNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Lịch sử sửa bệnh án: ghi bản chụp mỗi lần lưu có thay đổi, dựng dòng thời gian kèm các thay đổi từng lần. */
@Service
public class RecordHistoryService {
  /** Các ô của bệnh án được theo dõi, đúng thứ tự trên phiếu */
  public static final List<String> FIELDS = List.of("reason", "symptoms", "personalHistory", "familyHistory", "pulse", "temperature",
      "bpSystolic", "bpDiastolic", "respiratoryRate", "spo2", "weight", "height", "generalExam", "organExam", "labSummary", "orders",
      "diagnosis", "icdCode", "secondaryDiagnosis", "secondaryIcdCodes", "treatment", "followUpDate");

  private final MedicalRecordRevisionRepository revisions;
  private final PrescriptionRepository prescriptions;
  private final UserRepository users;
  private final ObjectMapper mapper;

  public RecordHistoryService(MedicalRecordRevisionRepository revisions, PrescriptionRepository prescriptions, UserRepository users, ObjectMapper mapper) {
    this.revisions = revisions;
    this.prescriptions = prescriptions;
    this.users = users;
    this.mapper = mapper;
  }

  /** Nội dung bệnh án dạng JSON (chỉ các ô theo dõi). */
  public JsonNode snapshot(MedicalRecord r) {
    Map<String, Object> all = Rows.record(r);
    Map<String, Object> m = new LinkedHashMap<>();
    for (String f : FIELDS) m.put(f, all.get(f));
    return mapper.valueToTree(m);
  }

  /** Hai giá trị bằng nhau: số so theo giá trị (37 và 37.0 là một), null và thiếu là một. */
  static boolean same(JsonNode a, JsonNode b) {
    boolean an = a == null || a.isNull();
    boolean bn = b == null || b.isNull();
    if (an || bn) return an && bn;
    if (a.isNumber() && b.isNumber()) return a.decimalValue().compareTo(b.decimalValue()) == 0;
    return a.asText().equals(b.asText());
  }

  static List<String> changed(JsonNode before, JsonNode after) {
    List<String> out = new ArrayList<>();
    for (String f : FIELDS) if (!same(before == null ? null : before.get(f), after.get(f))) out.add(f);
    return out;
  }

  /** Ghi một bản sau khi bác sĩ lưu; nội dung không đổi thì bỏ qua. */
  @Transactional
  public void recordSaved(MedicalRecord r, String editorUserId, boolean afterDone) {
    JsonNode after = snapshot(r);
    MedicalRecordRevision last = revisions.findFirstByRecordIdOrderByVersionDesc(r.getId()).orElse(null);
    JsonNode before = last == null ? null : parse(last.getSnapshot());
    if (last != null && changed(before, after).isEmpty()) return;
    MedicalRecordRevision rev = new MedicalRecordRevision();
    rev.setRecordId(r.getId());
    rev.setVisitId(r.getVisitId());
    rev.setVersion(last == null ? 1 : last.getVersion() + 1);
    rev.setAction(last == null ? "CREATE" : "UPDATE");
    rev.setEditedById(editorUserId);
    rev.setAfterDone(afterDone);
    rev.setSnapshot(after.toString());
    revisions.saveAndFlush(rev);
  }

  private JsonNode parse(String json) {
    try {
      return mapper.readTree(json);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Bản chụp bệnh án hỏng", e);
    }
  }

  private static Object plain(JsonNode n) {
    if (n == null || n instanceof NullNode) return null;
    if (n.isNumber()) return n.numberValue();
    return n.asText();
  }

  /**
   * Dòng thời gian của một lượt khám, cũ nhất trước: các lần lưu bệnh án (kèm ô nào đổi, trước/sau) và các mốc đơn
   * thuốc (hoàn tất đơn, kê đơn thay thế).
   */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> timeline(String visitId) {
    List<MedicalRecordRevision> list = revisions.findByVisitIdOrderByVersionAsc(visitId);
    List<Prescription> rx = prescriptions.findByVisitIdOrderByCreatedAtDesc(visitId);
    Set<String> userIds = new HashSet<>();
    list.forEach(r -> {
      if (r.getEditedById() != null) userIds.add(r.getEditedById());
    });
    Map<String, User> byId = users.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, Function.identity()));
    Function<String, Object> who = id -> {
      User u = id == null ? null : byId.get(id);
      return u == null ? null : Json.obj("id", u.getId(), "fullName", u.getFullName(), "role", u.getRole());
    };

    record Event(Instant at, Map<String, Object> body) {}
    List<Event> events = new ArrayList<>();
    JsonNode prev = null;
    for (MedicalRecordRevision r : list) {
      JsonNode snap = parse(r.getSnapshot());
      List<Map<String, Object>> changes = new ArrayList<>();
      if (!"BASELINE".equals(r.getAction())) {
        for (String f : changed(prev, snap)) {
          changes.add(Json.obj("field", f, "before", prev == null ? null : plain(prev.get(f)), "after", plain(snap.get(f))));
        }
      }
      events.add(new Event(r.getCreatedAt(), Json.obj("kind", "RECORD", "id", r.getId(), "version", r.getVersion(), "action", r.getAction(),
          "at", r.getCreatedAt(), "afterDone", r.isAfterDone(), "editedBy", who.apply(r.getEditedById()), "changes", changes)));
      prev = snap;
    }
    for (Prescription p : rx) {
      if (p.getStatus() == PrescriptionStatus.FINALIZED && p.getFinalizedAt() != null) {
        events.add(new Event(p.getFinalizedAt(), Json.obj("kind", "PRESCRIPTION", "id", p.getId(), "action", p.getReplacesId() == null ? "FINALIZED" : "REPLACED",
            "at", p.getFinalizedAt(), "code", p.getCode())));
      }
    }
    events.sort(Comparator.comparing(Event::at));
    return events.stream().map(Event::body).toList();
  }

  /** visitId → {revisions, editedAfterDone} cho danh sách. */
  @Transactional(readOnly = true)
  public Map<String, Map<String, Object>> summaries(List<String> visitIds) {
    Map<String, Map<String, Object>> out = new LinkedHashMap<>();
    if (visitIds.isEmpty()) return out;
    for (Object[] row : revisions.summaryOf(visitIds)) {
      out.put((String) row[0], Json.obj("revisions", ((Number) row[1]).intValue(), "editedAfterDone", ((Number) row[2]).intValue() > 0));
    }
    return out;
  }
}
