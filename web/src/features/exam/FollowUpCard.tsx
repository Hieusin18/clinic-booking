import { CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, DatePicker, Empty, Flex, Popconfirm, Spin, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Appointment, Slot } from '../../lib/types';

/**
 * Đổi ngày tái khám trong bệnh án thì nơi dùng đặt key theo ngày để thẻ mở lại đúng ngày mới.
 *
 * Hẹn tái khám: bác sĩ chọn luôn một giờ trống của mình để giữ chỗ cho bệnh nhân (lịch xác nhận ngay).
 * Không chọn giờ thì bệnh nhân được báo ngày hẹn và được nhắc tự đặt lịch trước 3 ngày.
 */
export function FollowUpCard({
  visitId,
  doctorId,
  followUpDate,
  appointment,
}: {
  visitId: string;
  doctorId: string;
  /** Ngày tái khám đã lưu trong bệnh án (YYYY-MM-DD…) */
  followUpDate: string;
  appointment: Appointment | null | undefined;
}) {
  const [date, setDate] = useState<Dayjs>(() => dayjs(followUpDate.slice(0, 10)));
  const ymd = date.format('YYYY-MM-DD');
  const slots = useQuery({
    queryKey: ['slots', doctorId, ymd],
    enabled: !appointment,
    queryFn: async () => (await api.get<Slot[]>(`/doctors/${doctorId}/schedules`, { params: { date: ymd } })).data,
  });
  const book = useAction((scheduleId: string) => api.post(`/visits/${visitId}/follow-up`, { scheduleId }), {
    success: 'Đã đặt lịch tái khám, bệnh nhân đã được báo',
    invalidate: ['visit', 'slots'],
  });
  const cancel = useAction(() => api.delete(`/visits/${visitId}/follow-up`), { success: 'Đã hủy lịch tái khám', invalidate: ['visit', 'slots'] });

  return (
    <Card
      title={
        <span>
          <CalendarOutlined /> Lịch tái khám
        </span>
      }
    >
      {appointment ? (
        <Flex justify="space-between" align="center" wrap gap={12}>
          <div>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {formatTime(appointment.schedule.startTime)} · {formatDate(appointment.schedule.startTime)}
            </Typography.Text>
            <div>
              <Typography.Text type="secondary">Đã giữ chỗ và xác nhận; bệnh nhân đã được báo trên app và sẽ được nhắc trước giờ khám.</Typography.Text>
            </div>
          </div>
          <Popconfirm title="Hủy lịch tái khám này?" description="Khung giờ được mở lại; bệnh nhân được báo." okText="Hủy lịch" cancelText="Không" onConfirm={() => cancel.mutate(undefined)}>
            <Button danger loading={cancel.isPending}>
              Hủy lịch
            </Button>
          </Popconfirm>
        </Flex>
      ) : (
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">
            Chọn một giờ trống để giữ chỗ cho bệnh nhân. Nếu không chọn, bệnh nhân được báo ngày hẹn và được nhắc tự đặt lịch trước 3 ngày.
          </Typography.Text>
          <Flex gap={8} align="center" wrap>
            <Typography.Text>Ngày</Typography.Text>
            <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
            {ymd !== followUpDate.slice(0, 10) && <Typography.Text type="secondary">(ngày hẹn trong bệnh án sẽ đổi theo giờ bạn chọn)</Typography.Text>}
          </Flex>
          {slots.isLoading ? (
            <Spin />
          ) : slots.data?.length ? (
            <Flex gap={8} wrap>
              {slots.data.map((s) => (
                <Popconfirm key={s.id} title={`Đặt lịch tái khám ${formatTime(s.startTime)} ngày ${date.format('DD/MM/YYYY')}?`} okText="Đặt lịch" cancelText="Không" onConfirm={() => book.mutate(s.id)}>
                  <Button loading={book.isPending && book.variables === s.id}>{formatTime(s.startTime)}</Button>
                </Popconfirm>
              ))}
            </Flex>
          ) : (
            <Alert
              type="info"
              showIcon
              title="Ngày này bạn chưa mở giờ khám hoặc đã kín"
              description={
                <span>
                  Chọn ngày khác, hoặc <Link to="/doctor/schedule">mở khung giờ</Link> cho ngày này. Không đặt giờ thì bệnh nhân vẫn được nhắc tự đặt lịch.
                </span>
              }
            />
          )}
        </Flex>
      )}
      {!appointment && slots.isError && <Empty description="Không tải được giờ khám" />}
    </Card>
  );
}
