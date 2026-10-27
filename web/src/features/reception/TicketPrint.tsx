import { Button, Modal, Typography } from 'antd';
import { doctorName, formatTime } from '../../lib/format';
import type { Visit } from '../../lib/types';

/** Phiếu số thứ tự: hiện trên màn hình và in ra (chỉ phần .ticket được in, xem index.css). */
export function TicketModal({ visit, onClose }: { visit: Visit | null; onClose: () => void }) {
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
        <div className="ticket" style={{ textAlign: 'center', padding: 16, border: '1px dashed #94a3b8', borderRadius: 12 }}>
          <Typography.Text type="secondary">PHÒNG KHÁM · PHIẾU KHÁM BỆNH</Typography.Text>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, color: '#0f766e' }}>{visit.queueNumber}</div>
          <Typography.Title level={4} style={{ margin: 0 }}>{visit.patient.fullName}</Typography.Title>
          <div>{doctorName(visit.doctor)}{visit.doctor.specialty ? ` · ${visit.doctor.specialty.name}` : ''}</div>
          <Typography.Text type="secondary">Lấy số lúc {formatTime(visit.createdAt)}</Typography.Text>
        </div>
      )}
    </Modal>
  );
}
