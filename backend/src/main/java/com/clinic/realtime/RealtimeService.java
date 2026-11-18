package com.clinic.realtime;

import com.clinic.entity.Doctor;
import com.clinic.entity.Visit;
import com.clinic.repository.VisitRepository;
import com.clinic.util.QueueOrder;
import com.clinic.view.Json;
import com.clinic.util.AfterCommit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Cập nhật tức thì qua WebSocket. Sự kiện chỉ báo "có gì đổi", không mang dữ liệu bệnh án: máy khách nhận xong
 * thì gọi lại API như cũ (API vẫn kiểm tra quyền).
 * <ul>
 *   <li>queue:changed {doctorId?} → staff: hàng đợi hoặc lịch hẹn trong ngày vừa đổi</li>
 *   <li>queue:called {visitId, label, room, doctorName, doctorFullName, recall} → staff: loa ở màn hình quầy đọc số</li>
 *   <li>visit:changed {visitId, status} → bệnh nhân: phiếu số của mình vừa đổi</li>
 *   <li>visit:called {visitId, label, room, recall} → bệnh nhân: đến lượt mình</li>
 *   <li>notification:new {id, type, title, body, url} → bệnh nhân: có thông báo mới</li>
 * </ul>
 * Các dịch vụ khác gọi vào đây sau khi đổi dữ liệu; lỗi ở đây không làm hỏng thao tác chính.
 */
@Service
public class RealtimeService {
  private final RealtimeGateway gateway;
  private final VisitRepository visits;
  private final TransactionTemplate readTx;

  public RealtimeService(RealtimeGateway gateway, VisitRepository visits, PlatformTransactionManager txm) {
    this.gateway = gateway;
    this.visits = visits;
    this.readTx = new TransactionTemplate(txm);
    readTx.setReadOnly(true);
    readTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /** Phiên đăng nhập cũ của tài khoản vừa hết hiệu lực: ngắt kết nối realtime tương ứng. */
  public void disconnectUser(String userId, Integer keepVer) {
    AfterCommit.run(() -> gateway.disconnectUser(userId, keepVer));
  }

  /** Gửi riêng cho một tài khoản (vd. thông báo mới của bệnh nhân). */
  public void toUser(String userId, String event, Object payload) {
    AfterCommit.run(() -> gateway.emit(RealtimeGateway.userRoom(userId), event, payload));
  }

  /** Báo cho nhân viên rằng hàng đợi / lịch hẹn trong ngày vừa đổi. */
  public void staffChanged(String doctorId) {
    AfterCommit.run(() -> gateway.emit(RealtimeGateway.STAFF_ROOM, "queue:changed", doctorId == null ? Json.obj() : Json.obj("doctorId", doctorId)));
  }

  public void staffChanged() {
    staffChanged(null);
  }

  /** Một lượt khám vừa đổi trạng thái: báo nhân viên và chính bệnh nhân đó. */
  public void visitChanged(String visitId) {
    AfterCommit.run(() -> readTx.executeWithoutResult(s -> emitVisitChanged(visitId)));
  }

  private void emitVisitChanged(String visitId) {
    Visit v = visits.findById(visitId).orElse(null);
    if (v == null) return;
    gateway.emit(RealtimeGateway.STAFF_ROOM, "queue:changed", Json.obj("doctorId", v.getDoctorId(), "visitId", visitId));
    String userId = v.getPatient().getUserId();
    if (userId != null) {
      gateway.emit(RealtimeGateway.userRoom(userId), "visit:changed", Json.obj("visitId", visitId, "status", v.getStatus()));
    }
  }

  /** Bác sĩ gọi (hoặc gọi lại) một số: màn hình quầy đọc loa, app của bệnh nhân báo đến lượt. */
  public void called(String visitId, boolean recall) {
    AfterCommit.run(() -> readTx.executeWithoutResult(s -> emitCalled(visitId, recall)));
  }

  private void emitCalled(String visitId, boolean recall) {
    Visit v = visits.findById(visitId).orElse(null);
    if (v == null) return;
    String label = QueueOrder.ticketLabel(v.getSource(), v.getQueueNumber());
    Doctor d = v.getDoctor();
    String fullName = d.getUser().getFullName();
    String doctorName = (d.getTitle() != null && !d.getTitle().isEmpty() ? d.getTitle() + " " : "") + fullName;
    gateway.emit(RealtimeGateway.STAFF_ROOM, "queue:called", Json.obj("visitId", visitId, "label", label, "room", d.getRoom(),
        "doctorName", doctorName, "doctorFullName", fullName, "recall", recall));
    gateway.emit(RealtimeGateway.STAFF_ROOM, "queue:changed", Json.obj("doctorId", v.getDoctorId(), "visitId", visitId));
    String userId = v.getPatient().getUserId();
    if (userId != null) {
      gateway.emit(RealtimeGateway.userRoom(userId), "visit:called", Json.obj("visitId", visitId, "label", label, "room", d.getRoom(), "recall", recall));
      gateway.emit(RealtimeGateway.userRoom(userId), "visit:changed", Json.obj("visitId", visitId, "status", v.getStatus()));
    }
  }
}
