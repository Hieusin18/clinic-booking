import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Row, Segmented, Select, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { age, doctorName, formatTime, GENDER_LABEL, ticketLabel } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { useClinicSettings } from '../../lib/settings';
import { C } from '../../lib/theme';
import type { Visit, Vitals } from '../../lib/types';
import { bmi } from '../exam/RecordCard';
import { useDoctorOptions } from '../reception/useDoctorOptions';
import { VISIT_STATUS } from '../reception/visitStatus';
import { summary, VITAL_FIELDS, warnings, type VitalField } from './vitals';

type Row = Visit & { vitals: Vitals | null };
type VitalsForm = Partial<Record<VitalField, number | null>> & { note?: string };
type Show = 'todo' | 'waiting' | 'all';

const num = (min: number, max: number, unit: string, step = 1, autoFocus = false) => (
  <InputNumber min={min} max={max} step={step} addonAfter={unit} style={{ width: '100%' }} autoFocus={autoFocus} />
);

function Warnings({ v }: { v: Partial<Record<VitalField, number | null>> }) {
  const list = warnings(v);
  if (!list.length) return null;
  return (
    <Flex gap={4} wrap>
      {list.map((w) => (
        <Tag key={w.text} color={w.severe ? 'error' : 'warning'} style={{ margin: 0 }}>
          {w.text}
        </Tag>
      ))}
    </Flex>
  );
}

/** Hộp nhập sinh hiệu: mở sẵn số đã đo (nếu có), cảnh báo chỉ số bất thường ngay khi nhập. */
function VitalsModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [form] = Form.useForm<VitalsForm>();
  const values = Form.useWatch([], form) ?? {};
  const index = bmi(values.weight, values.height);
  const save = useAction(
    (f: VitalsForm) => {
      const body: Record<string, unknown> = { note: f.note?.trim() || null };
      for (const k of VITAL_FIELDS) body[k] = f[k] ?? null;
      return api.put(`/visits/${row.id}/vitals`, body);
    },
    { success: `Đã lưu sinh hiệu ${ticketLabel(row)}`, invalidate: ['queue'] },
  );
  const initial: VitalsForm = row.vitals
    ? { ...Object.fromEntries(VITAL_FIELDS.map((k) => [k, row.vitals![k]])), note: row.vitals.note ?? undefined }
    : {};

  return (
    <Modal
      open
      title={
        <Flex gap={10} align="baseline" wrap>
          <span className="num" style={{ fontSize: 26, fontWeight: 700, color: C.stamp }}>
            {ticketLabel(row)}
          </span>
          <span>{row.patient.fullName}</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
            {GENDER_LABEL[row.patient.gender]} · {age(row.patient.dateOfBirth)} tuổi
          </Typography.Text>
        </Flex>
      }
      okText="Lưu sinh hiệu"
      cancelText="Đóng"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      width={620}
      destroyOnHidden
    >
      {row.patient.allergies && <Alert type="error" showIcon title={`Dị ứng: ${row.patient.allergies}`} style={{ marginBottom: 12 }} />}
      <Form<VitalsForm> form={form} layout="vertical" requiredMark={false} initialValues={initial} onFinish={(f) => save.mutate(f, { onSuccess: onClose })}>
        <Row gutter={12}>
          <Col xs={12} md={8}>
            <Form.Item label="Nhiệt độ" name="temperature">{num(30, 45, '°C', 0.1, true)}</Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label="Mạch" name="pulse">{num(20, 250, 'l/ph')}</Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label="SpO₂" name="spo2">{num(50, 100, '%')}</Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              label="HA tâm thu"
              name="bpSystolic"
              dependencies={['bpDiastolic']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v) =>
                    (v == null) === (getFieldValue('bpDiastolic') == null) ? Promise.resolve() : Promise.reject(new Error('Nhập đủ cả tâm thu và tâm trương')),
                }),
              ]}
            >
              {num(40, 300, 'mmHg')}
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label="HA tâm trương" name="bpDiastolic">{num(20, 200, 'mmHg')}</Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label="Nhịp thở" name="respiratoryRate">{num(5, 80, 'l/ph')}</Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label="Cân nặng" name="weight">{num(0.5, 400, 'kg', 0.1)}</Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label="Chiều cao" name="height" extra={index ? `BMI: ${index.toLocaleString('vi-VN')}` : undefined}>
              {num(30, 250, 'cm')}
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Ghi chú cho bác sĩ" name="note">
          <Input maxLength={300} placeholder="Vd. bệnh nhân mệt, cần khám sớm" />
        </Form.Item>
        <Warnings v={values} />
      </Form>
    </Modal>
  );
}

/** Điều dưỡng: danh sách bệnh nhân hôm nay, đo và nhập sinh hiệu trong lúc bệnh nhân chờ khám. */
export function NursePage() {
  const doctors = useDoctorOptions();
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const [show, setShow] = useState<Show>('todo');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const list = useQuery({
    queryKey: ['queue', 'vitals', doctorId ?? ''],
    queryFn: async () => (await api.get<Row[]>('/vitals/today', { params: doctorId ? { doctorId } : {} })).data,
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const active = (list.data ?? []).filter((v) => v.status === 'WAITING' || v.status === 'IN_PROGRESS');
    const base = show === 'all' ? (list.data ?? []) : show === 'waiting' ? active : active.filter((v) => !v.vitals);
    return base
      .filter((v) => !t || v.patient.fullName.toLowerCase().includes(t) || ticketLabel(v).toLowerCase() === t || v.patient.phone.startsWith(t))
      // Người sắp được gọi lên trước
      .sort((a, b) => (a.predictedOrder ?? 999) - (b.predictedOrder ?? 999) || a.createdAt.localeCompare(b.createdAt));
  }, [list.data, show, term]);
  const callIn = useAction((id: string) => api.post(`/visits/${id}/vitals/call`), {
    success: 'Đã gọi bệnh nhân vào đo, app của bệnh nhân đã báo',
    invalidate: ['queue'],
  });
  const settings = useClinicSettings();
  const todo = (list.data ?? []).filter((v) => (v.status === 'WAITING' || v.status === 'IN_PROGRESS') && !v.vitals).length;

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Đo sinh hiệu
          </Typography.Title>
          <Typography.Text type="secondary">
            Gọi bệnh nhân vào đo theo thứ tự (người sắp đến lượt ở trên cùng), nhập kết quả là xong.{' '}
            {settings.data?.vitalsBeforeExam ? 'Bác sĩ chỉ gọi vào khám những người đã đo.' : 'Bác sĩ mở phiếu khám là có sẵn số đo.'}
          </Typography.Text>
        </div>
        <Flex gap={8} wrap>
          <Input.Search allowClear placeholder="Tên, SĐT hoặc số (A03)" onSearch={setTerm} onChange={(e) => !e.target.value && setTerm('')} style={{ width: 220 }} />
          <Select
            aria-label="Bác sĩ"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Tất cả bác sĩ"
            value={doctorId}
            onChange={setDoctorId}
            options={doctors.options}
            style={{ width: 220 }}
          />
          <Segmented<Show>
            value={show}
            onChange={setShow}
            options={[
              { value: 'todo', label: `Chưa đo (${todo})` },
              { value: 'waiting', label: 'Đang chờ' },
              { value: 'all', label: 'Cả ngày' },
            ]}
          />
        </Flex>
      </Flex>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<Row>
          rowKey="id"
          loading={list.isLoading}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: show === 'todo' ? 'Đã đo hết cho bệnh nhân đang chờ' : 'Chưa có bệnh nhân' }}
          onRow={(v) => ({ onClick: () => setOpen(v), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: 'Số',
              width: 80,
              render: (_, v) => (
                <span className="num" style={{ fontSize: 26, fontWeight: 700, color: v.source === 'ONLINE' ? C.stamp : C.ink }}>
                  {ticketLabel(v)}
                </span>
              ),
            },
            {
              title: 'Bệnh nhân',
              render: (_, v) => (
                <div>
                  <Typography.Text strong>{v.patient.fullName}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {GENDER_LABEL[v.patient.gender]} · {age(v.patient.dateOfBirth)} tuổi · đến {formatTime(v.createdAt)}
                    </Typography.Text>
                  </div>
                  {v.patient.allergies && (
                    <Tag color="error" style={{ marginTop: 4 }}>
                      Dị ứng: {v.patient.allergies}
                    </Tag>
                  )}
                </div>
              ),
            },
            {
              title: 'Bác sĩ',
              width: 200,
              render: (_, v) => (
                <div>
                  <div>{doctorName(v.doctor)}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {v.doctor.room ?? v.doctor.specialty?.name}
                  </Typography.Text>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              width: 130,
              render: (_, v) =>
                v.status === 'WAITING' && v.predictedOrder === 0 ? (
                  <Tag style={{ background: C.ink, color: '#fff', borderColor: C.ink }}>Tiếp theo</Tag>
                ) : (
                  <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag>
                ),
            },
            {
              title: 'Sinh hiệu',
              render: (_, v) =>
                v.vitals ? (
                  <Flex vertical gap={4}>
                    <span>{summary(v.vitals)}</span>
                    <Warnings v={v.vitals} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatTime(v.vitals.measuredAt)}
                      {v.vitals.measuredBy ? ` · ${v.vitals.measuredBy.fullName}` : ''}
                    </Typography.Text>
                  </Flex>
                ) : v.vitalsCalledAt && v.status === 'WAITING' ? (
                  <Tag color="processing">Đã gọi vào đo lúc {formatTime(v.vitalsCalledAt)}</Tag>
                ) : (
                  <Tag color="default">Chưa đo</Tag>
                ),
            },
            {
              title: '',
              width: 190,
              render: (_, v) =>
                v.status === 'WAITING' || v.status === 'IN_PROGRESS' ? (
                  <Flex gap={6} wrap onClick={(e) => e.stopPropagation()}>
                    {/* Gọi vào đo: app bệnh nhân báo mời vào khu đo sinh hiệu */}
                    {!v.vitals && v.status === 'WAITING' && (
                      <Button
                        size="small"
                        type={v.vitalsCalledAt ? 'default' : 'primary'}
                        loading={callIn.isPending && callIn.variables === v.id}
                        onClick={() => callIn.mutate(v.id)}
                        aria-label={`${v.vitalsCalledAt ? 'Gọi lại' : 'Gọi vào đo'} ${ticketLabel(v)}`}
                      >
                        {v.vitalsCalledAt ? 'Gọi lại' : 'Gọi vào đo'}
                      </Button>
                    )}
                    <Button
                      type={!v.vitals && v.vitalsCalledAt ? 'primary' : 'default'}
                      size="small"
                      onClick={() => setOpen(v)}
                      aria-label={`Đo sinh hiệu ${ticketLabel(v)}`}
                    >
                      {v.vitals ? 'Sửa' : 'Nhập kết quả đo'}
                    </Button>
                  </Flex>
                ) : null,
            },
          ]}
        />
      </Card>
      {open && (open.status === 'WAITING' || open.status === 'IN_PROGRESS') && <VitalsModal row={open} onClose={() => setOpen(null)} />}
    </Flex>
  );
}
