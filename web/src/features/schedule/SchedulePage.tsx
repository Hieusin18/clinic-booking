import { DeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, DatePicker, Empty, Flex, Form, Popconfirm, Row, Select, Spin, Tag, TimePicker, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDay, formatTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Slot } from '../../lib/types';

type DaySlot = Slot & { date: string };
type OpenForm = { date: Dayjs; range: [Dayjs, Dayjs]; slotMinutes: number };

/** Gom khung giờ theo ngày (cột date dạng YYYY-MM-DDT00:00:00Z). */
export function groupByDay(slots: DaySlot[]) {
  const map = new Map<string, DaySlot[]>();
  for (const s of slots) {
    const key = s.date.slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Bác sĩ: mở khung giờ theo ca và xem lịch làm việc trong tuần. */
export function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const [form] = Form.useForm<OpenForm>();

  const slots = useQuery({
    queryKey: ['schedules', from, to],
    queryFn: async () => (await api.get<DaySlot[]>('/schedules/mine', { params: { from, to } })).data,
  });

  const open = useAction(
    async (v: OpenForm) =>
      (
        await api.post<{ created: number; skipped: number }>('/schedules/bulk', {
          date: v.date.format('YYYY-MM-DD'),
          start: v.range[0].format('HH:mm'),
          end: v.range[1].format('HH:mm'),
          slotMinutes: v.slotMinutes,
        })
      ).data,
    { invalidate: ['schedules'] },
  );
  const remove = useAction((id: string) => api.delete(`/schedules/${id}`), { success: 'Đã xóa khung giờ', invalidate: ['schedules'] });

  const days = groupByDay(slots.data ?? []);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Card title="Mở khung giờ khám">
          <Form<OpenForm>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ date: dayjs().add(1, 'day'), range: [dayjs('08:00', 'HH:mm'), dayjs('11:00', 'HH:mm')], slotMinutes: 15 }}
            onFinish={(v) => open.mutate(v, { onSuccess: () => setWeekStart(v.date.startOf('week')) })}
          >
            <Form.Item label="Ngày khám" name="date" rules={[{ required: true, message: 'Chọn ngày' }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item label="Ca làm việc" name="range" rules={[{ required: true, message: 'Chọn giờ bắt đầu và kết thúc' }]}>
              <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Mỗi lượt khám" name="slotMinutes">
              <Select options={[10, 15, 20, 30, 45, 60].map((m) => ({ value: m, label: `${m} phút` }))} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={open.isPending}>
              Mở khung giờ
            </Button>
          </Form>
          {open.data && (
            <Typography.Paragraph type="success" style={{ marginTop: 12, marginBottom: 0 }}>
              Đã mở {open.data.created} khung giờ{open.data.skipped ? `, bỏ qua ${open.data.skipped} khung giờ đã có` : ''}.
            </Typography.Paragraph>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <Card
          title="Lịch làm việc"
          extra={
            <Flex gap={8} align="center">
              <Button onClick={() => setWeekStart((w) => w.subtract(7, 'day'))}>‹ Tuần trước</Button>
              <Typography.Text strong>
                {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
              </Typography.Text>
              <Button onClick={() => setWeekStart((w) => w.add(7, 'day'))}>Tuần sau ›</Button>
            </Flex>
          }
        >
          {slots.isLoading ? (
            <Spin />
          ) : days.length === 0 ? (
            <Empty description="Tuần này chưa mở khung giờ nào" />
          ) : (
            <Flex vertical gap={20}>
              {days.map(([day, list]) => {
                const booked = list.filter((s) => s.appointments?.length).length;
                return (
                  <div key={day}>
                    <Typography.Title level={5} style={{ marginBottom: 8 }}>
                      {formatDay(`${day}T00:00:00.000Z`)}{' '}
                      <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                        · {booked}/{list.length} lượt đã có người đặt
                      </Typography.Text>
                    </Typography.Title>
                    <Flex wrap gap={8}>
                      {list.map((s) => {
                        const appt = s.appointments?.[0];
                        return appt ? (
                          <Tooltip key={s.id} title={appt.reason ? `Lý do: ${appt.reason}` : 'Không ghi lý do'}>
                            <Tag color="cyan" style={{ padding: '4px 10px', fontSize: 13 }}>
                              {formatTime(s.startTime)} · {appt.patient.fullName}
                            </Tag>
                          </Tooltip>
                        ) : (
                          <Tag key={s.id} style={{ padding: '4px 4px 4px 10px', fontSize: 13 }}>
                            {formatTime(s.startTime)}{' '}
                            <Popconfirm title="Xóa khung giờ này?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(s.id)}>
                              <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Xóa khung giờ ${formatTime(s.startTime)}`} />
                            </Popconfirm>
                          </Tag>
                        );
                      })}
                    </Flex>
                  </div>
                );
              })}
            </Flex>
          )}
        </Card>
      </Col>
    </Row>
  );
}
