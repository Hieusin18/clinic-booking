import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Flex, Form, Input, Modal, Popconfirm, Select, Table, Tabs, Tag, TimePicker, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { doctorName, formatTime, todayYmd } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { C, NUM } from '../../lib/theme';
import type { DoctorShift, StaffShift, WorkSchedule } from '../../lib/types';
import { SHIFT_PRESETS, byDay, totalHours, weekDays } from './week';

type Doctor = WorkSchedule['doctors'][number];
type Receptionist = WorkSchedule['receptionists'][number];
type ShiftForm = { userId: string; date: Dayjs; range: [Dayjs, Dayjs]; note?: string };

const range = (s: { startTime: string; endTime: string }) => `${formatTime(s.startTime)}–${formatTime(s.endTime)}`;

/** Ô ca khám của bác sĩ: giờ ca và số lượt đã đặt / số lượt mở. */
function DoctorCell({ shifts }: { shifts: DoctorShift[] }) {
  if (!shifts.length) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <Flex vertical gap={4}>
      {shifts.map((s) => (
        <Tooltip key={s.startTime} title={`${s.booked}/${s.slots} lượt đã có người đặt`}>
          <Flex vertical style={{ background: C.stampSoft, color: C.stamp, borderRadius: 6, padding: '2px 8px', lineHeight: 1.35 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{range(s)}</span>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {s.booked}/{s.slots} lượt đặt
            </span>
          </Flex>
        </Tooltip>
      ))}
    </Flex>
  );
}

/** Admin: xem lịch làm việc theo tuần của bác sĩ (từ khung giờ khám đã mở) và lễ tân (ca trực), xếp ca trực lễ tân. */
export function WorkSchedulePage() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [tab, setTab] = useState<'doctors' | 'receptionists' | 'nurses'>('doctors');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm<ShiftForm>();
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const today = todayYmd();
  const days = weekDays(weekStart);

  const data = useQuery({
    queryKey: ['work-schedule', from, to],
    queryFn: async () => (await api.get<WorkSchedule>('/work-schedule', { params: { from, to } })).data,
  });

  const create = useAction(
    (v: ShiftForm) =>
      api.post('/shifts', {
        userId: v.userId,
        date: v.date.format('YYYY-MM-DD'),
        start: v.range[0].format('HH:mm'),
        end: v.range[1].format('HH:mm'),
        note: v.note || undefined,
      }),
    { success: 'Đã xếp ca trực', invalidate: ['work-schedule'] },
  );
  const remove = useAction((id: string) => api.delete(`/shifts/${id}`), { success: 'Đã xóa ca trực', invalidate: ['work-schedule'] });

  const openAdd = (userId?: string, date?: Dayjs) => {
    form.resetFields();
    form.setFieldsValue({
      userId,
      date: date ?? (dayjs().isAfter(weekStart) ? dayjs() : weekStart),
      range: [dayjs(SHIFT_PRESETS[0].start, 'HH:mm'), dayjs(SHIFT_PRESETS[0].end, 'HH:mm')],
    });
    setAdding(true);
  };

  const term = search.trim().toLowerCase();
  const doctors = useMemo(
    () => (data.data?.doctors ?? []).filter((d) => !term || d.fullName.toLowerCase().includes(term) || d.specialty.name.toLowerCase().includes(term)),
    [data.data, term],
  );
  const receptionists = useMemo(() => (data.data?.receptionists ?? []).filter((r) => !term || r.fullName.toLowerCase().includes(term)), [data.data, term]);
  const nurses = useMemo(() => (data.data?.nurses ?? []).filter((r) => !term || r.fullName.toLowerCase().includes(term)), [data.data, term]);
  // Ai được xếp ca: tab đang mở là điều dưỡng thì chọn điều dưỡng, còn lại chọn lễ tân
  const staffKind = tab === 'nurses' ? 'điều dưỡng' : 'lễ tân';
  const staffOptions = (tab === 'nurses' ? (data.data?.nurses ?? []) : (data.data?.receptionists ?? [])).map((r) => ({ value: r.id, label: r.fullName }));

  const dayColumn = <T extends { shifts: { date: string }[] }>(d: Dayjs, render: (row: T, shifts: T['shifts']) => ReactNode) => {
    const key = d.format('YYYY-MM-DD');
    const isToday = key === today;
    return {
      key,
      title: (
        <Flex vertical align="center" style={{ lineHeight: 1.2, color: isToday ? C.stamp : undefined }}>
          <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{d.format('dddd')}</span>
          <span style={{ fontFamily: NUM, fontSize: 18, fontWeight: 600 }}>{d.format('DD/MM')}</span>
        </Flex>
      ),
      width: 122,
      onCell: () => ({ style: isToday ? { background: 'rgba(58, 63, 176, 0.05)' } : {} }),
      render: (_: unknown, row: T) => render(row, (byDay(row.shifts).get(key) ?? []) as T['shifts']),
    };
  };

  const doctorColumns = [
    {
      key: 'name',
      title: 'Bác sĩ',
      fixed: 'left' as const,
      width: 180,
      render: (_: unknown, d: Doctor) => (
        <Flex vertical>
          <Typography.Text strong>{doctorName({ title: d.title, user: { fullName: d.fullName } })}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {d.specialty.name}
            {d.room ? ` · ${d.room}` : ''}
          </Typography.Text>
        </Flex>
      ),
    },
    ...days.map((d) => dayColumn<Doctor>(d, (_row, shifts) => <DoctorCell shifts={shifts} />)),
    { key: 'total', title: 'Tổng', width: 72, align: 'right' as const, render: (_: unknown, d: Doctor) => totalHours(d.shifts) },
  ];

  const staffColumns = (title: string) => [
    {
      key: 'name',
      title,
      fixed: 'left' as const,
      width: 180,
      render: (_: unknown, r: Receptionist) => (
        <Flex vertical>
          <Typography.Text strong>{r.fullName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {r.phone}
          </Typography.Text>
        </Flex>
      ),
    },
    ...days.map((d) =>
      dayColumn<Receptionist>(d, (row, shifts) => {
        const past = d.format('YYYY-MM-DD') < today;
        return (
          <Flex vertical gap={4} align="flex-start">
            {(shifts as StaffShift[]).map((s) => (
              <Tag key={s.id} color="green" style={{ margin: 0, fontSize: 12, paddingInline: '6px 0' }}>
                <Tooltip title={s.note}>{range(s)}</Tooltip>
                {!past && (
                  <Popconfirm title="Xóa ca trực này?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(s.id)}>
                    <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Xóa ca ${range(s)} của ${row.fullName}`} style={{ height: 20 }} />
                  </Popconfirm>
                )}
              </Tag>
            ))}
            {past && !shifts.length && <Typography.Text type="secondary">—</Typography.Text>}
            {!past && (
              <Button size="small" type="dashed" icon={<PlusOutlined />} aria-label={`Xếp ca cho ${row.fullName} ngày ${d.format('DD/MM')}`} onClick={() => openAdd(row.id, d)} />
            )}
          </Flex>
        );
      }),
    ),
    { key: 'total', title: 'Tổng', width: 72, align: 'right' as const, render: (_: unknown, r: Receptionist) => totalHours(r.shifts) },
  ];

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Lịch làm việc
        </Typography.Title>
        <Flex gap={8} align="center" wrap>
          <Button onClick={() => setWeekStart((w) => w.subtract(7, 'day'))}>‹ Tuần trước</Button>
          <Button onClick={() => setWeekStart(dayjs().startOf('week'))}>Tuần này</Button>
          <Typography.Text strong>
            {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
          </Typography.Text>
          <Button onClick={() => setWeekStart((w) => w.add(7, 'day'))}>Tuần sau ›</Button>
        </Flex>
      </Flex>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        tabBarExtraContent={
          <Flex gap={8}>
            <Input.Search allowClear placeholder={tab === 'doctors' ? 'Tìm bác sĩ, chuyên khoa' : `Tìm ${staffKind}`} onSearch={setSearch} onChange={(e) => !e.target.value && setSearch('')} style={{ width: 220 }} />
            {tab !== 'doctors' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdd()}>
                Xếp ca
              </Button>
            )}
          </Flex>
        }
        items={[
          {
            key: 'doctors',
            label: `Bác sĩ (${data.data?.doctors.length ?? 0})`,
            children: (
              <>
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                  Ca khám lấy từ các khung giờ bác sĩ đã mở, kèm số lượt đã có người đặt / số lượt mở.
                </Typography.Paragraph>
                <Table<Doctor> rowKey="id" size="small" loading={data.isLoading} dataSource={doctors} columns={doctorColumns} pagination={false} scroll={{ x: 1110 }} locale={{ emptyText: 'Chưa có bác sĩ' }} />
              </>
            ),
          },
          {
            key: 'receptionists',
            label: `Lễ tân (${data.data?.receptionists.length ?? 0})`,
            children: (
              <Table<Receptionist>
                rowKey="id"
                size="small"
                loading={data.isLoading}
                dataSource={receptionists}
                columns={staffColumns('Lễ tân')}
                pagination={false}
                scroll={{ x: 1110 }}
                locale={{ emptyText: 'Chưa có lễ tân' }}
              />
            ),
          },
          {
            key: 'nurses',
            label: `Điều dưỡng (${data.data?.nurses?.length ?? 0})`,
            children: (
              <Table<Receptionist>
                rowKey="id"
                size="small"
                loading={data.isLoading}
                dataSource={nurses}
                columns={staffColumns('Điều dưỡng')}
                pagination={false}
                scroll={{ x: 1110 }}
                locale={{ emptyText: 'Chưa có điều dưỡng' }}
              />
            ),
          },
        ]}
      />
      <Modal
        title={`Xếp ca trực ${staffKind}`}
        open={adding}
        okText="Xếp ca"
        cancelText="Hủy"
        confirmLoading={create.isPending}
        onCancel={() => setAdding(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<ShiftForm> form={form} layout="vertical" requiredMark={false} onFinish={(v) => create.mutate(v, { onSuccess: () => setAdding(false) })}>
          <Form.Item label={tab === 'nurses' ? 'Điều dưỡng' : 'Lễ tân'} name="userId" rules={[{ required: true, message: `Chọn ${staffKind}` }]}>
            <Select showSearch optionFilterProp="label" placeholder={`Chọn ${staffKind}`} options={staffOptions} />
          </Form.Item>
          <Form.Item label="Ngày" name="date" rules={[{ required: true, message: 'Chọn ngày' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item label="Giờ trực" required>
            <Flex gap={6} wrap style={{ marginBottom: 8 }}>
              {SHIFT_PRESETS.map((p) => (
                <Button key={p.label} size="small" onClick={() => form.setFieldValue('range', [dayjs(p.start, 'HH:mm'), dayjs(p.end, 'HH:mm')])}>
                  {p.label} {p.start}–{p.end}
                </Button>
              ))}
            </Flex>
            <Form.Item name="range" noStyle rules={[{ required: true, message: 'Chọn giờ vào ca và hết ca' }]}>
              <TimePicker.RangePicker format="HH:mm" minuteStep={15} style={{ width: '100%' }} />
            </Form.Item>
          </Form.Item>
          <Form.Item label="Ghi chú" name="note">
            <Input maxLength={100} placeholder="Vd. Quầy 1" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
