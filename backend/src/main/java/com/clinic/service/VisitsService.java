package com.clinic.service;

import com.clinic.config.AppEnv;
import com.clinic.dto.PageQuery;
import com.clinic.dto.visit.PrescriptionRequest;
import com.clinic.dto.visit.RecordRequest;
import com.clinic.entity.Doctor;
import com.clinic.entity.LabFile;
import com.clinic.entity.LabOrder;
import com.clinic.entity.MedicalRecord;
import com.clinic.entity.Patient;
import com.clinic.entity.Prescription;
import com.clinic.entity.PrescriptionItem;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.AppointmentStatus;
import com.clinic.entity.enums.PrescriptionStatus;
import com.clinic.entity.enums.ResultMode;
import com.clinic.entity.enums.Role;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.export.DocxRenderer;
import com.clinic.export.ExportVisit;
import com.clinic.export.HtmlRenderer;
import com.clinic.export.PdfRenderer;
import com.clinic.export.PrintDoc;
import com.clinic.export.PrintDocBuilder;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.AppointmentRepository;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.LabFileInfo;
import com.clinic.repository.LabFileRepository;
import com.clinic.repository.LabOrderRepository;
import com.clinic.repository.MedicalRecordRepository;
import com.clinic.repository.MedicineRepository;
import com.clinic.repository.PatientRepository;
import com.clinic.repository.PrescriptionItemRepository;
import com.clinic.repository.PrescriptionRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.view.ClinicalViews;
import com.clinic.view.Json;
import com.clinic.view.Rows;
import com.clinic.view.VisitViews;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Lượt khám: bệnh án, hoàn tất lượt khám, đơn thuốc, lịch sử khám, xuất bệnh án PDF / Word / HTML. */
@Service
public class VisitsService {
  private static final String CODE_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
  private static final SecureRandom RANDOM = new SecureRandom();

  private final VisitRepository visits;
  private final DoctorRepository doctors;
  private final PatientRepository patients;
  private final MedicalRecordRepository records;
  private final PrescriptionRepository prescriptions;
  private final PrescriptionItemRepository items;
  private final MedicineRepository medicines;
  private final LabOrderRepository labOrders;
  private final LabFileRepository labFiles;
  private final AppointmentRepository appointments;
  private final PatientScope scope;
  private final AccountLinkService link;
  private final RealtimeService realtime;
  private final NotificationsService notifications;
  private final QueueService queue;
  private final AppEnv env;
  private final com.clinic.repository.Refresher refresher;
  private final RecordHistoryService history;
  private final VitalsService vitals;
  private final FollowUpService followUps;
  private final String secret;

  public VisitsService(VisitRepository visits, DoctorRepository doctors, PatientRepository patients, MedicalRecordRepository records,
      PrescriptionRepository prescriptions, PrescriptionItemRepository items, MedicineRepository medicines, LabOrderRepository labOrders,
      LabFileRepository labFiles, AppointmentRepository appointments, PatientScope scope, AccountLinkService link, RealtimeService realtime,
      NotificationsService notifications, QueueService queue, AppEnv env, com.clinic.repository.Refresher refresher,
      RecordHistoryService history, VitalsService vitals, FollowUpService followUps) {
    this.vitals = vitals;
    this.followUps = followUps;
    this.visits = visits;
    this.doctors = doctors;
    this.patients = patients;
    this.records = records;
    this.prescriptions = prescriptions;
    this.items = items;
    this.medicines = medicines;
    this.labOrders = labOrders;
    this.labFiles = labFiles;
    this.appointments = appointments;
    this.scope = scope;
    this.link = link;
    this.realtime = realtime;
    this.notifications = notifications;
    this.queue = queue;
    this.env = env;
    this.refresher = refresher;
    this.history = history;
    this.secret = env.require("JWT_SECRET");
    // Thiếu font thì dừng ngay lúc khởi động thay vì lỗi khi bệnh nhân tải bệnh án
    com.clinic.export.Fonts.check();
  }

  /** Thông tin phòng khám in trên bệnh án và đơn thuốc, đặt trong .env. */
  public PrintDocBuilder.Clinic clinic() {
    String code = env.get("CLINIC_CODE", "PK001");
    code = code.length() > 5 ? code.substring(0, 5) : String.format("%-5s", code).replace(' ', '0');
    return new PrintDocBuilder.Clinic(env.get("CLINIC_NAME", "Phòng khám Đa khoa"), env.get("CLINIC_ADDRESS", ""), env.get("CLINIC_PHONE", ""), code);
  }

  /**
   * Mã đơn thuốc theo Thông tư 26/2025/TT-BYT: xxxxxyyyyyyy-z gồm 5 ký tự mã cơ sở, 7 ký tự ngẫu nhiên và loại đơn
   * (C = đơn thuốc thông thường).
   */
  public String prescriptionCode() {
    StringBuilder sb = new StringBuilder(clinic().code());
    for (int i = 0; i < 7; i++) sb.append(CODE_CHARS.charAt(RANDOM.nextInt(CODE_CHARS.length())));
    return sb.append("-C").toString();
  }

  public String doctorIdOf(AuthUser user) {
    return doctors.findByUserId(user.sub()).map(Doctor::getId).orElseThrow(() -> ApiException.forbidden("Tài khoản không gắn với bác sĩ nào"));
  }

  /** Phiếu khám thuộc bác sĩ đang đăng nhập, cùng id bác sĩ. */
  public record Own(Visit visit, String doctorId) {}

  /** Phiếu khám phải thuộc bác sĩ đang đăng nhập và đang khám, đang chờ kết quả cận lâm sàng, hoặc đã khám xong. */
  public Own ownVisit(AuthUser user, String visitId) {
    String doctorId = doctorIdOf(user);
    Visit v = visits.findById(visitId).filter(x -> x.getDoctorId().equals(doctorId)).orElseThrow(() -> ApiException.notFound("Không tìm thấy phiếu khám"));
    if (!List.of(VisitStatus.IN_PROGRESS, VisitStatus.AWAITING_RESULTS, VisitStatus.DONE).contains(v.getStatus())) {
      throw ApiException.conflict("Chỉ ghi được cho bệnh nhân đang khám, hãy gọi số trước");
    }
    return new Own(v, doctorId);
  }

  private static String blank(String v) {
    if (v == null) return null;
    String t = v.trim();
    return t.isEmpty() ? null : t;
  }

  /** Chuỗi rỗng từ form nghĩa là bỏ trống: lưu null để xóa được giá trị cũ. */
  @Transactional
  public Map<String, Object> saveRecord(AuthUser user, String visitId, RecordRequest dto) {
    Visit visit = ownVisit(user, visitId).visit();
    LocalDate followUp = dto.followUpDate() == null ? null : LocalDate.parse(dto.followUpDate());
    if (followUp != null && !followUp.isAfter(visit.getDate())) throw ApiException.badRequest("Ngày tái khám phải sau ngày khám");
    if ((dto.bpSystolic() == null) != (dto.bpDiastolic() == null)) throw ApiException.badRequest("Nhập đủ cả huyết áp tâm thu và tâm trương");
    if (dto.bpSystolic() != null && dto.bpSystolic() <= dto.bpDiastolic()) throw ApiException.badRequest("Huyết áp tâm thu phải lớn hơn tâm trương");
    MedicalRecord r = records.findByVisitId(visitId).orElseGet(() -> {
      MedicalRecord n = new MedicalRecord();
      n.setVisitId(visitId);
      return n;
    });
    r.setReason(blank(dto.reason()));
    r.setSymptoms(dto.symptoms().trim());
    r.setPersonalHistory(blank(dto.personalHistory()));
    r.setFamilyHistory(blank(dto.familyHistory()));
    r.setPulse(dto.pulse());
    r.setTemperature(dto.temperature());
    r.setBpSystolic(dto.bpSystolic());
    r.setBpDiastolic(dto.bpDiastolic());
    r.setRespiratoryRate(dto.respiratoryRate());
    r.setSpo2(dto.spo2());
    r.setWeight(dto.weight());
    r.setHeight(dto.height());
    r.setGeneralExam(blank(dto.generalExam()));
    r.setOrganExam(blank(dto.organExam()));
    r.setLabSummary(blank(dto.labSummary()));
    // Web mới dùng danh sách chỉ định (LabOrder); không gửi ô này thì giữ nguyên ghi chú cũ
    if (dto.orders() != null) r.setOrders(blank(dto.orders()));
    r.setDiagnosis(dto.diagnosis().trim());
    r.setIcdCode(blank(dto.icdCode()));
    r.setSecondaryDiagnosis(blank(dto.secondaryDiagnosis()));
    String secondary = blank(dto.secondaryIcdCodes());
    r.setSecondaryIcdCodes(secondary == null ? null : String.join(", ", secondary.split("\\s*,\\s*")));
    r.setTreatment(blank(dto.treatment()));
    // Đổi ngày tái khám thì nhắc lại theo ngày mới
    if (!java.util.Objects.equals(r.getFollowUpDate(), followUp)) r.setFollowUpRemindedAt(null);
    r.setFollowUpDate(followUp);
    MedicalRecord saved = records.saveAndFlush(r);
    // Lịch sử sửa để admin tra lại (lần lưu không đổi gì thì không ghi)
    history.recordSaved(saved, user.sub(), visit.getStatus() == VisitStatus.DONE);
    return Rows.record(saved);
  }

  /**
   * Hoàn tất lượt khám: cần có bệnh án, mọi chỉ định cận lâm sàng đã có kết quả; lịch hẹn (nếu có) chuyển sang đã khám.
   * Lượt đang chờ kết quả theo chế độ online hoàn tất được ngay (bác sĩ gửi kết quả và đơn lên app); chế độ quay lại
   * thì phải đưa bệnh nhân vào lại hàng chờ và gọi vào trước.
   */
  @Transactional
  public Map<String, Object> complete(AuthUser user, String visitId) {
    Visit visit = ownVisit(user, visitId).visit();
    if (visit.getStatus() == VisitStatus.DONE) throw ApiException.conflict("Lượt khám đã hoàn tất");
    if (visit.getStatus() == VisitStatus.AWAITING_RESULTS && visit.getResultMode() != ResultMode.ONLINE) {
      throw ApiException.conflict("Bệnh nhân sẽ quay lại đọc kết quả: hãy đưa vào hàng chờ và gọi vào trước khi hoàn tất");
    }
    List<LabOrder> pending = labOrders.findByVisitIdAndDoneAtIsNullOrderByCreatedAtAsc(visitId);
    if (!pending.isEmpty()) {
      throw ApiException.conflict("Chưa trả kết quả: " + pending.stream().map(LabOrder::getName).collect(Collectors.joining(", ")));
    }
    if (records.findByVisitId(visitId).isEmpty()) throw ApiException.conflict("Cần ghi bệnh án trước khi hoàn tất lượt khám");
    if (!prescriptions.findByVisitIdAndStatus(visitId, PrescriptionStatus.DRAFT).isEmpty()) {
      throw ApiException.conflict("Đơn thuốc còn ở dạng nháp, hãy hoàn tất hoặc xóa đơn");
    }
    if (visit.getAppointmentId() != null) {
      appointments.findById(visit.getAppointmentId()).ifPresent(a -> a.setStatus(AppointmentStatus.COMPLETED));
    }
    visit.setStatus(VisitStatus.DONE);
    visit.setCompletedAt(Instant.now());
    visits.saveAndFlush(visit);
    realtime.visitChanged(visitId);
    notifications.visitDone(visitId);
    followUps.visitCompleted(visit);
    return queue.view(visit);
  }

  // ---- Đơn thuốc ----

  private Map<String, Object> prescriptionView(Prescription p) {
    Doctor d = doctors.findById(p.getDoctorId()).orElseThrow();
    return ClinicalViews.prescription(p, d, items.findByPrescriptionId(p.getId()));
  }

  private Function<String, List<LabFileInfo>> filesOf(List<LabOrder> orders) {
    if (orders.isEmpty()) return id -> List.of();
    Map<String, List<LabFileInfo>> byOrder = labFiles.infoOf(orders.stream().map(LabOrder::getId).toList()).stream()
        .collect(Collectors.groupingBy(LabFileInfo::labOrderId));
    return id -> byOrder.getOrDefault(id, List.of());
  }

  /**
   * Chi tiết lượt khám. Bác sĩ phụ trách thấy cả đơn nháp; bệnh nhân chỉ thấy đơn hiệu lực; admin xem được mọi lượt
   * (chỉ đọc). Lễ tân không có quyền gọi (chặn ở controller).
   */
  @Transactional(readOnly = true)
  public Map<String, Object> detail(AuthUser user, String visitId) {
    Visit found = visits.findById(visitId).orElseThrow(() -> ApiException.notFound("Không tìm thấy phiếu khám"));
    List<Prescription> list = prescriptions.findByVisitIdOrderByCreatedAtDesc(visitId);
    List<LabOrder> orders = labOrders.findByVisitIdOrderByCreatedAtAsc(visitId);
    Map<String, Object> out = queue.view(found);
    out.put("medicalRecord", records.findByVisitId(visitId).map(Rows::record).orElse(null));
    // Lịch tái khám bác sĩ đã đặt sẵn (null = chưa đặt)
    out.put("followUpAppointment", followUps.appointmentOf(visitId));
    Prescription current = ClinicalViews.current(list);
    if (user.role() == Role.PATIENT) {
      PatientScope.Scope s = scope.scopeOf(user);
      if (!found.getPatientId().equals(s.patientId()) || (s.lockedBefore() != null && found.getCreatedAt().isBefore(s.lockedBefore()))) {
        throw ApiException.notFound("Không tìm thấy phiếu khám");
      }
      // Bệnh nhân chỉ thấy kết quả cận lâm sàng khi bác sĩ đã đọc và hoàn tất lượt khám
      out.put("labOrders", ClinicalViews.labOrders(orders, filesOf(orders), secret, found.getStatus() != VisitStatus.DONE));
      out.put("prescription", current == null ? null : prescriptionView(current));
      return out;
    }
    if (user.role() != Role.ADMIN && !found.getDoctorId().equals(doctorIdOf(user))) throw ApiException.notFound("Không tìm thấy phiếu khám");
    out.put("prescriptions", list.stream().map(this::prescriptionView).toList());
    // Sinh hiệu điều dưỡng đo lúc chờ: web điền sẵn vào bệnh án
    out.put("vitals", vitals.of(visitId));
    out.put("labOrders", ClinicalViews.labOrders(orders, filesOf(orders), secret, false));
    out.put("prescription", current == null ? null : prescriptionView(current));
    return out;
  }

  /** Bản điện tử bệnh án + đơn thuốc: cùng quyền với xem chi tiết (bệnh nhân của lượt khám hoặc bác sĩ phụ trách). */
  @Transactional
  public PrintDoc printDoc(AuthUser user, String visitId) {
    Map<String, Object> detail = detail(user, visitId);
    if (detail.get("medicalRecord") == null) throw ApiException.conflict("Lượt khám chưa có bệnh án");
    Visit visit = visits.findById(visitId).orElseThrow();
    Patient record = patients.findById(visit.getPatientId()).orElseThrow();
    // Hồ sơ chưa xác minh: bản bệnh nhân tự tải không in thông tin cá nhân lễ tân đã nhập (CCCD, địa chỉ, BHYT…)
    Patient patient = record;
    if (user.role() == Role.PATIENT && record.getHistoryLockedBefore() != null) {
      patient = new Patient();
      patient.setId(record.getId());
      patient.setFullName(record.getFullName());
      patient.setDateOfBirth(record.getDateOfBirth());
      patient.setGender(record.getGender());
      patient.setPhone(record.getPhone());
    }
    // Kết quả cận lâm sàng in kèm ảnh, nên đọc cả dữ liệu ảnh (bệnh nhân chỉ thấy khi đã hoàn tất)
    boolean showLab = user.role() != Role.PATIENT || visit.getStatus() == VisitStatus.DONE;
    List<ExportVisit.Lab> labs = new ArrayList<>();
    for (LabOrder o : labOrders.findByVisitIdOrderByCreatedAtAsc(visitId)) {
      if (showLab) {
        List<ExportVisit.File> files = labFiles.findByLabOrderIdOrderByCreatedAtAsc(o.getId()).stream()
            .map((LabFile f) -> new ExportVisit.File(f.getFileName(), f.getMimeType(), f.getData())).toList();
        labs.add(new ExportVisit.Lab(o.getName(), o.getNote(), o.getResultText(), o.getDoneAt(), files));
      } else {
        labs.add(new ExportVisit.Lab(o.getName(), o.getNote(), null, null, List.of()));
      }
    }
    MedicalRecord r = records.findByVisitId(visitId).orElseThrow();
    // Bác sĩ không ghi lại lý do khám thì dùng lý do bệnh nhân khai lúc đặt lịch/lấy số
    MedicalRecord printed = copyWithReason(r, r.getReason() != null ? r.getReason() : visit.getReason());
    Doctor d = visit.getDoctor();
    Prescription current = ClinicalViews.current(prescriptions.findByVisitIdOrderByCreatedAtDesc(visitId));
    ExportVisit.Rx rx = current == null ? null : new ExportVisit.Rx(current.getId(), current.getCode(), current.getAdvice(), current.getFinalizedAt(),
        items.findByPrescriptionId(current.getId()).stream().map((PrescriptionItem i) -> new ExportVisit.Item(i.getQuantity(), i.getDosePerTime(),
            i.getTimesPerDay(), i.getDays(), i.getNote(), i.getMedicine().getName(), i.getMedicine().getActiveIngredient(),
            i.getMedicine().getStrength(), i.getMedicine().getUnit())).toList());
    ExportVisit ev = new ExportVisit(visit.getId(), visit.getDate(), visit.getQueueNumber(), visit.getSource(), visit.getCreatedAt(), patient,
        new ExportVisit.Doctor(d.getTitle(), d.getUser().getFullName(), d.getSpecialty() == null ? null : d.getSpecialty().getName()), printed, labs, rx);
    // Bản bác sĩ in đưa bệnh nhân có mã liên kết; bản bệnh nhân tự tải thì không (tránh lộ mã cho tài khoản chưa xác minh)
    String linkCode = user.role() == Role.DOCTOR ? link.ensureLinkCode(patient.getId()) : null;
    return PrintDocBuilder.build(ev, clinic(), Instant.now(), linkCode);
  }

  private static MedicalRecord copyWithReason(MedicalRecord r, String reason) {
    MedicalRecord c = new MedicalRecord();
    org.springframework.beans.BeanUtils.copyProperties(r, c);
    c.setReason(reason);
    return c;
  }

  /** Tệp tải về: nội dung, kiểu và tên tệp. */
  public record Download(byte[] data, String contentType, String fileName) {
    @Override
    public boolean equals(Object o) {
      return o instanceof Download x && java.util.Arrays.equals(data, x.data) && java.util.Objects.equals(contentType, x.contentType) && java.util.Objects.equals(fileName, x.fileName);
    }

    @Override
    public int hashCode() {
      return 31 * java.util.Arrays.hashCode(data) + java.util.Objects.hashCode(contentType) + java.util.Objects.hashCode(fileName);
    }

    @Override
    public String toString() {
      return "Download[" + (data == null ? 0 : data.length) + " bytes" + ", " + contentType + ", " + fileName + "]";
    }
  }

  @Transactional
  public Download export(AuthUser user, String visitId, String format) throws IOException {
    PrintDoc doc = printDoc(user, visitId);
    if ("pdf".equals(format)) return new Download(PdfRenderer.render(doc), "application/pdf", doc.fileName() + ".pdf");
    return new Download(DocxRenderer.render(doc), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc.fileName() + ".docx");
  }

  /** Bản xem trước dạng HTML (cùng nội dung với PDF/Word) cho app và web hiển thị trước khi tải. */
  @Transactional
  public String preview(AuthUser user, String visitId) {
    return HtmlRenderer.render(printDoc(user, visitId));
  }

  // ---- Lịch sử khám ----

  /** Lượt khám kèm bệnh án và đơn hiệu lực (dùng cho lịch sử và tra cứu). */
  private Map<String, Object> historyItem(Visit v, boolean fullRecord) {
    Map<String, Object> m = queue.view(v);
    MedicalRecord r = records.findByVisitId(v.getId()).orElse(null);
    if (fullRecord) {
      m.put("medicalRecord", r == null ? null : Rows.record(r));
    } else {
      m.put("medicalRecord", r == null ? null : Json.obj("diagnosis", r.getDiagnosis(), "icdCode", r.getIcdCode(), "followUpDate", r.getFollowUpDate()));
    }
    Prescription current = ClinicalViews.current(prescriptions.findByVisitIdAndStatus(v.getId(), PrescriptionStatus.FINALIZED));
    m.put("prescription", current == null ? null : prescriptionView(current));
    return m;
  }

  /** Lịch sử khám của bệnh nhân đang đăng nhập (mới nhất trước). */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> myHistory(AuthUser user) {
    PatientScope.Scope s = scope.scopeOf(user);
    return history(s.patientId(), s.visibleFrom());
  }

  /** Bác sĩ xem các lần khám trước của bệnh nhân để tham khảo. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> patientHistory(AuthUser user, String patientId) {
    doctorIdOf(user);
    return history(patientId, Instant.EPOCH);
  }

  private List<Map<String, Object>> history(String patientId, Instant from) {
    // Gồm cả lượt đang chờ kết quả cận lâm sàng để bệnh nhân nhận kết quả online biết đang chờ.
    // Hồ sơ chưa xác minh: chỉ các lượt từ lúc tài khoản gắn vào hồ sơ
    return visits.history(patientId, List.of(VisitStatus.DONE, VisitStatus.AWAITING_RESULTS), from).stream().map(v -> historyItem(v, true)).toList();
  }

  /**
   * Bệnh án các lượt bác sĩ đã khám xong (mọi ngày), mới nhất trước. Tìm theo tên hoặc SĐT bệnh nhân, chẩn đoán hoặc mã
   * ICD; lọc theo khoảng ngày khám.
   */
  @Transactional(readOnly = true)
  public Map<String, Object> examined(AuthUser user, PageQuery q, String from, String to) {
    String doctorId = doctorIdOf(user);
    String text = q.term() == null ? "" : q.term();
    LocalDate f = from == null ? LocalDate.of(1900, 1, 1) : LocalDate.parse(from.substring(0, 10));
    LocalDate t = to == null ? LocalDate.of(9999, 12, 31) : LocalDate.parse(to.substring(0, 10));
    Page<Visit> page = visits.examined(doctorId, f, t, text, text.toUpperCase(), PageRequest.of(q.pageOrDefault() - 1, q.sizeOrDefault()));
    return q.toPage(page.getContent().stream().map(v -> historyItem(v, false)).toList(), page.getTotalElements());
  }

  /** Admin tra cứu bệnh án của mọi bác sĩ, kèm số lần lưu và có sửa sau khi hoàn tất hay không. */
  @Transactional(readOnly = true)
  public Map<String, Object> allRecords(PageQuery q, String doctorId, String from, String to) {
    String text = q.term() == null ? "" : q.term();
    LocalDate f = from == null ? LocalDate.of(1900, 1, 1) : LocalDate.parse(from.substring(0, 10));
    LocalDate t = to == null ? LocalDate.of(9999, 12, 31) : LocalDate.parse(to.substring(0, 10));
    Page<Visit> page = visits.withRecords(doctorId == null ? "" : doctorId, f, t, text, text.toUpperCase(),
        PageRequest.of(q.pageOrDefault() - 1, q.sizeOrDefault()));
    Map<String, Map<String, Object>> summary = history.summaries(page.getContent().stream().map(Visit::getId).toList());
    List<Map<String, Object>> items = page.getContent().stream().map(v -> {
      Map<String, Object> m = historyItem(v, false);
      MedicalRecord r = records.findByVisitId(v.getId()).orElseThrow();
      m.put("recordUpdatedAt", r.getUpdatedAt());
      m.put("history", summary.getOrDefault(v.getId(), Json.obj("revisions", 0, "editedAfterDone", false)));
      return m;
    }).toList();
    return q.toPage(items, page.getTotalElements());
  }

  /** Dòng thời gian sửa bệnh án: admin xem mọi lượt, bác sĩ xem lượt mình khám. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> recordHistory(AuthUser user, String visitId) {
    Visit v = visits.findById(visitId).orElseThrow(() -> ApiException.notFound("Không tìm thấy phiếu khám"));
    if (user.role() != Role.ADMIN && !v.getDoctorId().equals(doctorIdOf(user))) throw ApiException.notFound("Không tìm thấy phiếu khám");
    return history.timeline(visitId);
  }

  private void checkMedicines(List<PrescriptionRequest.Item> list) {
    Set<String> ids = new HashSet<>(list.stream().map(PrescriptionRequest.Item::medicineId).toList());
    if (ids.size() != list.size()) throw ApiException.badRequest("Một loại thuốc chỉ được ghi một dòng");
    if (medicines.countActive(ids) != ids.size()) throw ApiException.badRequest("Có thuốc không tồn tại hoặc đã ngừng dùng");
  }

  private void saveItems(String prescriptionId, List<PrescriptionRequest.Item> list) {
    for (PrescriptionRequest.Item i : list) {
      PrescriptionItem it = new PrescriptionItem();
      it.setPrescriptionId(prescriptionId);
      it.setMedicineId(i.medicineId());
      it.setQuantity(i.quantity());
      it.setDosePerTime(i.dosePerTime());
      it.setTimesPerDay(i.timesPerDay());
      it.setDays(i.days());
      it.setNote(i.note());
      items.save(it);
    }
    items.flush();
    // Nạp lại để dòng thuốc vừa thêm có thông tin thuốc (tên, hàm lượng) khi trả về
    for (PrescriptionItem it : items.findByPrescriptionId(prescriptionId)) refresher.refresh(it);
  }

  /**
   * Tạo đơn nháp. Nếu lượt khám đã có đơn hoàn tất thì đơn mới là đơn thay thế (replacesId trỏ về đơn cũ); đơn cũ giữ
   * nguyên để tra cứu.
   */
  @Transactional
  public Map<String, Object> createPrescription(AuthUser user, String visitId, PrescriptionRequest dto) {
    String doctorId = ownVisit(user, visitId).doctorId();
    checkMedicines(dto.items());
    List<Prescription> existing = prescriptions.findByVisitIdOrderByCreatedAtDesc(visitId);
    if (existing.stream().anyMatch(p -> p.getStatus() == PrescriptionStatus.DRAFT)) throw ApiException.conflict("Lượt khám đã có đơn nháp, hãy sửa đơn đó");
    Prescription replaces = ClinicalViews.current(existing);
    Prescription p = new Prescription();
    p.setVisitId(visitId);
    p.setDoctorId(doctorId);
    p.setAdvice(dto.advice());
    p.setReplacesId(replaces == null ? null : replaces.getId());
    prescriptions.saveAndFlush(p);
    saveItems(p.getId(), dto.items());
    return prescriptionView(p);
  }

  private Prescription ownDraft(AuthUser user, String id) {
    String doctorId = doctorIdOf(user);
    Prescription p = prescriptions.findById(id).filter(x -> x.getDoctorId().equals(doctorId))
        .orElseThrow(() -> ApiException.notFound("Không tìm thấy đơn thuốc"));
    if (p.getStatus() != PrescriptionStatus.DRAFT) throw ApiException.conflict("Đơn đã hoàn tất, không sửa được. Hãy tạo đơn mới để thay thế");
    return p;
  }

  @Transactional
  public Map<String, Object> updatePrescription(AuthUser user, String id, PrescriptionRequest dto) {
    ownDraft(user, id);
    checkMedicines(dto.items());
    items.deleteOf(id);
    Prescription p = prescriptions.findById(id).orElseThrow();
    p.setAdvice(dto.advice());
    prescriptions.saveAndFlush(p);
    saveItems(id, dto.items());
    return prescriptionView(p);
  }

  /** Hoàn tất đơn: từ đây đơn bị khóa và bệnh nhân xem được trên app. */
  @Transactional
  public Map<String, Object> finalizePrescription(AuthUser user, String id) {
    ownDraft(user, id);
    if (prescriptions.finalizeDraft(id, Instant.now(), prescriptionCode()) == 0) throw ApiException.conflict("Đơn đã hoàn tất");
    return prescriptionView(prescriptions.findById(id).orElseThrow());
  }

  @Transactional
  public void removeDraft(AuthUser user, String id) {
    Prescription p = ownDraft(user, id);
    items.deleteOf(id);
    prescriptions.deleteById(p.getId());
  }

}
