import { Button, Modal, Typography } from 'antd';
import { doctorName, formatTime, ticketLabel } from '../../lib/format';
import { C } from '../../lib/theme';
import type { Visit } from '../../lib/types';
import { spacedCode, useAppAccount } from './AppAccount';

/** Phiếu số thứ tự: hiện trên màn hình và in ra (chỉ phần .ticket được in, xem index.css). */
export function TicketModal({ visit, onClose }: { visit: Visit | null; onClose: () => void }) {
  // Bệnh nhân chưa xác minh tài khoản app: in mã liên kết lên phiếu để họ tự xem kết quả khám
  const account = useAppAccount(visit?.patient.id);
  const code = account.data?.linkCode && account.data.status !== 'VERIFIED' ? account.data.linkCode : null;
  return (
    <Modal
      open={visit !== null}
      onCancel={onClose}
      title="Đã cấp số"
      footer={[
        <Button key="close" onClick={onClose}>Đóng</Button>,
        <Button key="print" type="primary" onClick={() => window.print()}>In phiếu</Button>,
      ]}
    >
      {visit && (
        <div className="ticket" style={{ textAlign: 'center', padding: 16, border: `2px dashed ${C.line}`, borderRadius: 12 }}>
          <Typography.Text type="secondary">PHÒNG KHÁM · PHIẾU KHÁM BỆNH</Typography.Text>
          <div className="num" style={{ fontSize: 96, fontWeight: 700, lineHeight: 1.05, color: C.stamp }}>{ticketLabel(visit)}</div>
          <Typography.Title level={4} style={{ margin: 0 }}>{visit.patient.fullName}</Typography.Title>
          <div>{doctorName(visit.doctor)}{visit.doctor.specialty ? ` · ${visit.doctor.specialty.name}` : ''}</div>
          <Typography.Text type="secondary">
            {visit.appointmentAt ? `Lịch hẹn ${formatTime(visit.appointmentAt)} · ` : ''}Lấy số lúc {formatTime(visit.createdAt)}
          </Typography.Text>
          {code && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.line}`, fontSize: 13 }}>
              Xem kết quả khám trên app: đăng ký bằng SĐT {visit.patient.phone}, nhập mã liên kết
              <div className="num" style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>
                {spacedCode(code)}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
