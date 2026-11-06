import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Popconfirm, Select, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { doctorName, formatTime, ticketLabel } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Visit } from '../../lib/types';
import { useDoctorOptions } from './useDoctorOptions';
import { arrivalTag, byCallOrder, VISIT_STATUS } from './visitStatus';

/** Hàng đợi hôm nay của cả phòng khám, xếp theo thứ tự gọi dự kiến; tự làm mới mỗi 10 giây. */
export function QueueBoardPage() {
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const doctors = useDoctorOptions();
  const queue = useQuery({
    queryKey: ['queue', 'today', doctorId],
    queryFn: async () => (await api.get<Visit[]>('/queue/today', { params: doctorId ? { doctorId } : {} })).data,
    refetchInterval: 10_000,
  });
  const left = useAction((id: string) => api.patch(`/queue/${id}/left`), { success: 'Đã đánh dấu bỏ về', invalidate: ['queue'] });

  const list = [...(queue.data ?? [])].sort((a, b) => a.doctor.id.localeCompare(b.doctor.id) || byCallOrder(a, b));
  const count = (s: Visit['status']) => list.filter((v) => v.status === s).length;

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Hàng đợi hôm nay</Typography.Title>
        <Select allowClear placeholder="Tất cả bác sĩ" options={doctors.options} value={doctorId} onChange={setDoctorId} style={{ width: 280 }} />
      </Flex>
      <Flex gap={32} style={{ marginBottom: 16 }}>
        <Statistic title="Đang chờ" value={count('WAITING')} />
        <Statistic title="Đang khám" value={count('IN_PROGRESS')} />
        <Statistic title="Đã khám" value={count('DONE')} />
        <Statistic title="Bỏ về" value={count('LEFT')} />
      </Flex>
      <Table<Visit>
        rowKey="id"
        loading={queue.isLoading}
        dataSource={list}
        pagination={false}
        columns={[
          { title: 'Số', width: 70, render: (_, v) => <Typography.Text strong style={{ fontSize: 18 }}>{ticketLabel(v)}</Typography.Text> },
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
                  {v.checkinOverride ? <Tag color="orange">Check-in ngoài giờ</Tag> : null}
                </>
              );
            },
          },
          { title: 'Lấy số', render: (_, v) => formatTime(v.createdAt), width: 90 },
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
  );
}
