package com.clinic.service;

import com.clinic.config.AppEnv;
import com.clinic.entity.LabFile;
import com.clinic.entity.LabOrder;
import com.clinic.entity.Visit;
import com.clinic.entity.enums.ResultMode;
import com.clinic.entity.enums.VisitStatus;
import com.clinic.exception.ApiException;
import com.clinic.realtime.RealtimeService;
import com.clinic.repository.LabFileRepository;
import com.clinic.repository.LabOrderRepository;
import com.clinic.repository.VisitRepository;
import com.clinic.security.AuthUser;
import com.clinic.util.LabFiles;
import com.clinic.view.ClinicalViews;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cận lâm sàng (X-quang, siêu âm, xét nghiệm…) do bác sĩ phụ trách chỉ định và trả kết quả.
 * <ol>
 *   <li>Đang khám, bác sĩ thêm chỉ định rồi "gửi đi cận lâm sàng" với một trong hai cách nhận kết quả:
 *       RETURN (bệnh nhân làm xong quay lại, được gọi trước mọi người để đọc kết quả, kết luận, kê đơn) hoặc
 *       ONLINE (bệnh nhân về nhà; bác sĩ ghi kết quả, kết luận, kê đơn rồi hoàn tất, bệnh nhân xem trên app).
 *       Khi đã gửi đi, lượt khám ở trạng thái AWAITING_RESULTS nên bác sĩ gọi được người tiếp theo.</li>
 *   <li>Bác sĩ tải tệp kết quả (ảnh JPG/PNG, PDF) và ghi mô tả, kết luận cho từng chỉ định.</li>
 * </ol>
 * Tệp kết quả mở qua đường dẫn có chữ ký hết hạn sau 1 giờ (không cần header đăng nhập), để thẻ &lt;img&gt; trên web
 * và ảnh trong app hiển thị được. Bệnh nhân chỉ thấy kết quả khi bác sĩ đã hoàn tất lượt khám.
 */
@Service
public class LabResultsService {
  private final LabOrderRepository orders;
  private final LabFileRepository files;
  private final VisitRepository visits;
  private final VisitsService visitsService;
  private final QueueService queue;
  private final RealtimeService realtime;
  private final NotificationsService notifications;
  private final String secret;

  public LabResultsService(LabOrderRepository orders, LabFileRepository files, VisitRepository visits, VisitsService visitsService, QueueService queue,
      RealtimeService realtime, NotificationsService notifications, AppEnv env) {
    this.orders = orders;
    this.files = files;
    this.visits = visits;
    this.visitsService = visitsService;
    this.queue = queue;
    this.realtime = realtime;
    this.notifications = notifications;
    this.secret = env.require("JWT_SECRET");
  }

  /** Tệp tải về. */
  public record FileData(byte[] data, String mimeType, String fileName) {
    @Override
    public boolean equals(Object o) {
      return o instanceof FileData x && java.util.Arrays.equals(data, x.data) && java.util.Objects.equals(mimeType, x.mimeType) && java.util.Objects.equals(fileName, x.fileName);
    }

    @Override
    public int hashCode() {
      return 31 * java.util.Arrays.hashCode(data) + java.util.Objects.hashCode(mimeType) + java.util.Objects.hashCode(fileName);
    }

    @Override
    public String toString() {
      return "FileData[" + (data == null ? 0 : data.length) + " bytes" + ", " + mimeType + ", " + fileName + "]";
    }
  }

  private LabOrder ownOrder(AuthUser user, String id) {
    LabOrder o = orders.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy chỉ định"));
    visitsService.ownVisit(user, o.getVisitId());
    return o;
  }

  private Map<String, Object> view(LabOrder o) {
    return ClinicalViews.labOrder(o, files.infoOf(List.of(o.getId())), secret, false);
  }

  @Transactional
  public Map<String, Object> addOrder(AuthUser user, String visitId, String name, String note) {
    Visit visit = visitsService.ownVisit(user, visitId).visit();
    if (visit.getStatus() == VisitStatus.DONE) throw ApiException.conflict("Lượt khám đã hoàn tất, không thêm chỉ định được");
    LabOrder o = new LabOrder();
    o.setVisitId(visitId);
    o.setName(name);
    o.setNote(note == null || note.isEmpty() ? null : note);
    return view(orders.saveAndFlush(o));
  }

  @Transactional
  public void removeOrder(AuthUser user, String id) {
    LabOrder o = ownOrder(user, id);
    if (o.getDoneAt() != null || files.countByLabOrderId(id) > 0) {
      throw ApiException.conflict("Chỉ định đã có kết quả, hãy xóa tệp và mở lại trước khi xóa");
    }
    orders.delete(o);
  }

  /**
   * @param resultSent có gửi trường resultText không (gửi chuỗi rỗng = xóa mô tả)
   * @param done true = trả kết quả (cần có mô tả hoặc ít nhất một tệp); false = mở lại để sửa; null = giữ nguyên
   */
  @Transactional
  public Map<String, Object> saveResult(AuthUser user, String id, boolean resultSent, String resultText, Boolean done) {
    LabOrder o = ownOrder(user, id);
    String text = !resultSent ? o.getResultText() : resultText == null || resultText.isEmpty() ? null : resultText;
    if (Boolean.TRUE.equals(done) && text == null && files.countByLabOrderId(id) == 0) {
      throw ApiException.badRequest("Ghi mô tả kết quả hoặc tải ít nhất một tệp trước khi trả kết quả");
    }
    o.setResultText(text);
    if (done != null) o.setDoneAt(done ? (o.getDoneAt() != null ? o.getDoneAt() : Instant.now()) : null);
    return view(orders.saveAndFlush(o));
  }

  @Transactional
  public Map<String, Object> addFile(AuthUser user, String id, byte[] data, String originalName) {
    LabOrder o = ownOrder(user, id);
    if (data == null) throw ApiException.badRequest("Chưa chọn tệp");
    if (data.length > LabFiles.LAB_FILE_MAX_BYTES) throw ApiException.badRequest("Mỗi tệp tối đa 10 MB");
    String mimeType = LabFiles.detect(data);
    if (mimeType == null) throw ApiException.badRequest("Chỉ nhận ảnh JPG, PNG hoặc tệp PDF");
    if (files.countByLabOrderId(id) >= LabFiles.LAB_FILES_PER_ORDER) {
      throw ApiException.badRequest("Mỗi chỉ định tối đa " + LabFiles.LAB_FILES_PER_ORDER + " tệp");
    }
    LabFile f = new LabFile();
    f.setLabOrderId(id);
    f.setFileName(LabFiles.cleanFileName(originalName, mimeType));
    f.setMimeType(mimeType);
    f.setSize(data.length);
    f.setData(data);
    files.saveAndFlush(f);
    return view(o);
  }

  @Transactional
  public Map<String, Object> removeFile(AuthUser user, String fileId) {
    LabFile f = files.findById(fileId).orElseThrow(() -> ApiException.notFound("Không tìm thấy tệp"));
    LabOrder o = ownOrder(user, f.getLabOrderId());
    files.delete(f);
    files.flush();
    return view(o);
  }

  @Transactional(readOnly = true)
  public FileData file(String id, String exp, String sig) {
    if (!LabFiles.verifyLink(secret, id, exp, sig, System.currentTimeMillis())) {
      throw ApiException.notFound("Đường dẫn tệp không hợp lệ hoặc đã hết hạn");
    }
    LabFile f = files.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy tệp"));
    return new FileData(f.getData(), f.getMimeType(), f.getFileName());
  }

  /** Gửi bệnh nhân đi làm cận lâm sàng: bác sĩ rảnh để gọi người tiếp theo. */
  @Transactional
  public Map<String, Object> sendForTests(AuthUser user, String visitId, ResultMode mode, Instant now) {
    Visit visit = visitsService.ownVisit(user, visitId).visit();
    if (visit.getStatus() != VisitStatus.IN_PROGRESS) throw ApiException.conflict("Chỉ gửi đi cận lâm sàng được khi đang khám");
    if (orders.countByVisitIdAndDoneAtIsNull(visitId) == 0) throw ApiException.conflict("Thêm ít nhất một chỉ định chưa có kết quả trước khi gửi đi");
    visit.setStatus(VisitStatus.AWAITING_RESULTS);
    visit.setResultMode(mode);
    visit.setSentForTestsAt(now);
    visit.setResultsReadyAt(null);
    visits.saveAndFlush(visit);
    realtime.visitChanged(visitId);
    return queue.view(visit);
  }

  /**
   * Chế độ quay lại: đã có đủ kết quả, đưa bệnh nhân vào lại hàng chờ hôm nay; lần gọi tiếp theo sẽ gọi người này
   * trước (để đọc kết quả).
   */
  @Transactional
  public Map<String, Object> resultsReady(AuthUser user, String visitId, Instant now) {
    Visit visit = visitsService.ownVisit(user, visitId).visit();
    if (visit.getStatus() != VisitStatus.AWAITING_RESULTS || visit.getResultMode() != ResultMode.RETURN) {
      throw ApiException.conflict("Chỉ dùng cho bệnh nhân đi làm cận lâm sàng rồi quay lại");
    }
    List<LabOrder> pending = orders.findByVisitIdAndDoneAtIsNullOrderByCreatedAtAsc(visitId);
    if (!pending.isEmpty()) {
      throw ApiException.conflict("Chưa trả kết quả: " + pending.stream().map(LabOrder::getName).collect(Collectors.joining(", ")));
    }
    visit.setStatus(VisitStatus.WAITING);
    visit.setResultsReadyAt(now);
    visits.saveAndFlush(visit);
    realtime.visitChanged(visitId);
    notifications.resultsReady(visitId);
    return queue.view(visit);
  }

  /** Lượt khám của bác sĩ đang chờ kết quả cận lâm sàng (mọi ngày), cũ nhất trước. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> awaiting(AuthUser user) {
    return visits.awaiting(visitsService.doctorIdOf(user)).stream().map(queue::view).toList();
  }
}
