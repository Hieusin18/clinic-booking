import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Flex, Form, Input, List, Modal, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { age, doctorName, formatDate, formatTime, GENDER_LABEL } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { useRealtime } from '../../lib/realtime';
import { C } from '../../lib/theme';
import type { PendingAppointment } from '../../lib/types';

/** Lý do từ chối hay dùng (lễ tân bấm chọn rồi sửa nếu cần); bệnh nhân thấy lý do trong thông báo. */
export const REJECT_REASONS = [
  'Đặt nhiều lịch cùng lúc',
  'Thông tin bệnh nhân không rõ ràng',
  'Bác sĩ bận đột xuất, vui lòng chọn giờ khác',
  'Không liên lạc được để xác nhận',
];

const DAY_MS = 24 * 3600_000;

/** Dấu hiệu đáng ngờ của một lịch: đặt nhiều lịch cùng lúc, tài khoản vừa tạo, từng bỏ hẹn / bị từ chối. */
export function warnings(a: PendingAppointment, now = Date.now()): string[] {
  const i = a.patientInfo;
  const out: string[] = [];
  if (i.waiting > 1) out.push(`Đang chờ ${i.waiting} lịch`);
  if (i.accountCreatedAt && now - new Date(i.accountCreatedAt).getTime() < DAY_MS) out.push('Tài khoản mới tạo hôm nay');
  if (i.noShow > 0) out.push(`Từng không đến ${i.noShow} lần`);
  if (i.rejected > 0) out.push(`Từng bị từ chối ${i.rejected} lần`);
  return out;
}

/** Số lịch chờ duyệt, dùng cho số trên menu. */
export function usePendingCount(enabled: boolean) {
  const { connected } = useRealtime();
  return useQuery({
    queryKey: ['appointments', 'pending', 'count'],
    enabled,
    queryFn: async () => (await api.get<{ count: number }>('/appointments/pending/count')).data.count,
    refetchInterval: connected ? 120_000 : 30_000,
  });
}

/**
 * Lễ tân duyệt lịch đặt online. Lịch mới chưa có hiệu lực cho tới khi được duyệt (chống dùng công cụ đặt lịch hàng
 * loạt giữ chỗ); từ chối thì khung giờ được mở lại và bệnh nhân nhận thông báo kèm lý do.
 */
export function PendingAppointmentsPage() {
  const { connected } = useRealtime();
  const [rejecting, setRejecting] = useState<PendingAppointment | null>(null);
  const [form] = Form.useForm<{ reason?: string }>();
  const list = useQuery({
    queryKey: ['appointments', 'pending'],
    queryFn: async () => (await api.get<{ items: PendingAppointment[]; total: number }>('/appointments/pending')).data.items,
    refetchInterval: connected ? 120_000 : 30_000,
  });
  const confirm = useAction(async (id: string) => (await api.post(`/appointments/${id}/confirm`)).data, {
    success: 'Đã duyệt lịch, bệnh nhân sẽ nhận thông báo',
    invalidate: ['appointments'],
  });
  const reject = useAction(
    async ({ id, reason }: { id: string; reason?: string }) => (await api.post(`/appointments/${id}/reject`, { reason: reason || undefined })).data,
    { success: 'Đã từ chối lịch, khung giờ được mở lại', invalidate: ['appointments'] },
  );

  const items = list.data ?? [];
  return (
    <Card
      title="Duyệt lịch hẹn đặt online"
      extra={<Typography.Text type="secondary">{items.length} lịch chờ duyệt</Typography.Text>}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Lịch bệnh nhân đặt trên app chỉ có hiệu lực sau khi được duyệt. Lịch chưa duyệt vẫn giữ chỗ; quá giờ khám mà chưa duyệt thì tự hủy."
      />
      <List
        loading={list.isLoading}
        dataSource={items}
        locale={{ emptyText: <Empty description="Không có lịch nào chờ duyệt" /> }}
        renderItem={(a) => {
          const info = a.patientInfo;
          const flags = warnings(a);
          const busy = (confirm.isPending && confirm.variables === a.id) || (reject.isPending && reject.variables?.id === a.id);
          return (
            <List.Item
              actions={[
                <Button key="ok" type="primary" icon={<CheckOutlined />} loading={confirm.isPending && confirm.variables === a.id} disabled={busy} onClick={() => confirm.mutate(a.id)}>
                  Duyệt
                </Button>,
                <Button key="no" danger icon={<CloseOutlined />} disabled={busy} onClick={() => setRejecting(a)}>
                  Từ chối
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <div style={{ width: 92 }}>
                    <div className="num" style={{ fontSize: 26, fontWeight: 600, lineHeight: '30px', color: C.ink }}>{formatTime(a.schedule.startTime)}</div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDate(a.schedule.startTime)}</Typography.Text>
                  </div>
                }
                title={
                  <Space size={8} wrap>
                    <span>{a.patient.fullName}</span>
                    <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                      {GENDER_LABEL[info.gender]} · {age(info.dateOfBirth)} tuổi · {a.patient.phone}
                    </Typography.Text>
                  </Space>
                }
                description={
                  <Flex vertical gap={4}>
                    <span>
                      {doctorName(a.schedule.doctor)}
                      {a.reason ? ` · Lý do: ${a.reason}` : ''}
                    </span>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      Đặt lúc {formatTime(a.createdAt)} {formatDate(a.createdAt)} · Đã khám {info.completed} lần
                      {info.cancelled ? ` · Tự hủy ${info.cancelled} lần` : ''}
                    </Typography.Text>
                    {flags.length ? (
                      <div>
                        {flags.map((f) => (
                          <Tag key={f} color="warning">
                            {f}
                          </Tag>
                        ))}
                      </div>
                    ) : null}
                  </Flex>
                }
              />
            </List.Item>
          );
        }}
      />

      <Modal
        title={rejecting ? `Từ chối lịch của ${rejecting.patient.fullName}` : ''}
        open={!!rejecting}
        okText="Từ chối lịch"
        okButtonProps={{ danger: true }}
        cancelText="Quay lại"
        confirmLoading={reject.isPending}
        onCancel={() => setRejecting(null)}
        onOk={() =>
          form
            .validateFields()
            .then((v) => reject.mutateAsync({ id: rejecting!.id, reason: v.reason?.trim() }))
            .then(() => setRejecting(null))
            .catch(() => {})
        }
        destroyOnHidden
      >
        {rejecting ? (
          <Typography.Paragraph type="secondary">
            Lịch {formatTime(rejecting.schedule.startTime)} ngày {formatDate(rejecting.schedule.startTime)} với {doctorName(rejecting.schedule.doctor)}. Khung giờ sẽ được mở lại cho người khác.
          </Typography.Paragraph>
        ) : null}
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item label="Lý do (bệnh nhân thấy trong thông báo, có thể bỏ trống)" name="reason" rules={[{ max: 300, message: 'Tối đa 300 ký tự' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space wrap>
            {REJECT_REASONS.map((r) => (
              <Button key={r} size="small" onClick={() => form.setFieldValue('reason', r)}>
                {r}
              </Button>
            ))}
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}
