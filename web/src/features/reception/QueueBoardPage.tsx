import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Popconfirm, Select, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { doctorName, formatTime, ticketLabel } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Visit } from '../../lib/types';
import { useRealtime } from '../../lib/realtime';
import { C } from '../../lib/theme';
import { useDoctorOptions } from './useDoctorOptions';
import { arrivalTag, byCallOrder, VISIT_STATUS } from './visitStatus';

/** Ô số liệu: nhãn nhỏ, số lớn chữ hẹp. */
function Stat({ label, value, color = C.ink }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ flex: '1 1 140px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 18px' }}>
      <div style={{ color: C.muted, fontSize: 13 }}>{label}</div>
      <div className="num" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, color }}>
        {value}
      </div>
    </div>
  );
}

/** Hàng đợi hôm nay của cả phòng khám, xếp theo thứ tự gọi dự kiến; tự làm mới mỗi 10 giây. */
export function QueueBoardPage() {
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const { connected } = useRealtime();
  const doctors = useDoctorOptions();
  const queue = useQuery({
    queryKey: ['queue', 'today', doctorId],
    queryFn: async () => (await api.get<Visit[]>('/queue/today', { params: doctorId ? { doctorId } : {} })).data,
    refetchInterval: connected ? 120_000 : 10_000,
  });
  const left = useAction((id: string) => api.patch(`/queue/${id}/left`), { success: 'Đã đánh dấu bỏ về', invalidate: ['queue'] });

  const list = [...(queue.data ?? [])].sort((a, b) => a.doctor.id.localeCompare(b.doctor.id) || byCallOrder(a, b));
  const count = (s: Visit['status']) => list.filter((v) => v.status === s).length;

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>Hàng đợi hôm nay</Typography.Title>
        <Select allowClear placeholder="Tất cả bác sĩ" options={doctors.options} value={doctorId} onChange={setDoctorId} style={{ width: 280 }} />
      </Flex>
      <Flex gap={12} wrap>
        <Stat label="Đang chờ" value={count('WAITING')} color={C.amber} />
        <Stat label="Đang khám" value={count('IN_PROGRESS')} color={C.stamp} />
        <Stat label="Đang làm CLS" value={count('AWAITING_RESULTS')} color="#6B4FBF" />
        <Stat label="Đã khám" value={count('DONE')} color={C.good} />
        <Stat label="Bỏ về" value={count('LEFT')} color={C.muted} />
      </Flex>
      <Card styles={{ body: { padding: 0 } }}>
      <Table<Visit>
        rowKey="id"
        loading={queue.isLoading}
        dataSource={list}
        pagination={false}
        columns={[
          {
            title: 'Số',
            width: 76,
            render: (_, v) => (
              <span className="num" style={{ fontSize: 26, fontWeight: 700, color: v.source === 'ONLINE' ? C.stamp : C.ink }}>
                {ticketLabel(v)}
              </span>
            ),
          },
          { title: 'Bệnh nhân', render: (_, v) => v.patient.fullName },
          { title: 'Bác sĩ', render: (_, v) => doctorName(v.doctor) },
          {
            title: 'Nguồn',
            render: (_, v) => {
              const src = arrivalTag(v);
              return (
                <>
                  <Tag color={src.color}>{src.label}</Tag>
                  <Tag>{v.checkinMethod === 'QR' ? 'Quét QR' : 'Lễ tân'}</Tag>
                  {v.checkinOverride ? <Tag color="warning">Check-in ngoài giờ</Tag> : null}
                </>
              );
            },
          },
          { title: 'Lấy số', render: (_, v) => <span className="num" style={{ fontSize: 17 }}>{formatTime(v.createdAt)}</span>, width: 90 },
          {
            title: 'Dự kiến gọi',
            width: 160,
            render: (_, v) =>
              v.status === 'WAITING' && v.predictedOrder != null
                ? `${v.predictedOrder === 0 ? 'Tiếp theo' : `Thứ ${v.predictedOrder + 1}`}${v.estimatedCallAt ? ` · ~${formatTime(v.estimatedCallAt)}` : ''}`
                : '—',
          },
          { title: 'Trạng thái', render: (_, v) => <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag>, width: 120 },
          {
            title: '',
            width: 100,
            render: (_, v) =>
              v.status === 'WAITING' ? (
                <Popconfirm title={`Đánh dấu số ${ticketLabel(v)} bỏ về?`} okText="Đồng ý" cancelText="Hủy" onConfirm={() => left.mutate(v.id)}>
                  <Button size="small">Bỏ về</Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />
      </Card>
    </Flex>
  );
}
