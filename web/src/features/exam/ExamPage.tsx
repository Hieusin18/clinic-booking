import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { age, formatDay, formatTime, GENDER_LABEL } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Prescription, Visit, VisitDetail } from '../../lib/types';
import { VISIT_STATUS } from '../reception/visitStatus';
import { MedicineSelect, medicineLabel } from './MedicineSelect';

type RecordForm = { symptoms: string; diagnosis: string; orders?: string };
type ItemForm = { medicineId: string; quantity: number; dosePerTime: string; timesPerDay: number; days: number; note?: string };
type PrescriptionForm = { advice?: string; items: ItemForm[] };

/** Gợi ý số lượng cần mua khi bác sĩ chưa nhập: số lần/ngày × số ngày (giả định mỗi lần 1 đơn vị). */
export const suggestQuantity = (timesPerDay?: number, days?: number) => (timesPerDay && days ? timesPerDay * days : undefined);

/** Bác sĩ: hàng đợi hôm nay, gọi số, ghi bệnh án, kê đơn, hoàn tất lượt khám. */
export function ExamPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queue = useQuery({
    queryKey: ['queue', 'doctor'],
    queryFn: async () => (await api.get<Visit[]>('/queue/doctor')).data,
    refetchInterval: 15_000,
  });
  const list = queue.data ?? [];
  const current = list.find((v) => v.status === 'IN_PROGRESS');
  const activeId = selectedId ?? current?.id ?? null;
  const waiting = list.filter((v) => v.status === 'WAITING').length;

  const callNext = useAction(async () => (await api.post<Visit>('/queue/call-next')).data, { invalidate: ['queue'] });

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Card
          title="Hàng đợi hôm nay"
          extra={<Typography.Text type="secondary">{waiting} người đang chờ</Typography.Text>}
        >
          <Button
            type="primary"
            size="large"
            block
            disabled={!!current || waiting === 0}
            loading={callNext.isPending}
            onClick={() => callNext.mutate(undefined, { onSuccess: (v) => setSelectedId(v.id) })}
            style={{ marginBottom: 16 }}
          >
            {current ? `Đang khám số ${current.queueNumber}` : waiting === 0 ? 'Không còn ai đang chờ' : 'Gọi số tiếp theo'}
          </Button>
          <List
            loading={queue.isLoading}
            dataSource={list}
            locale={{ emptyText: 'Hôm nay chưa có bệnh nhân' }}
            renderItem={(v) => (
              <List.Item
                onClick={() => (v.status === 'IN_PROGRESS' || v.status === 'DONE' ? setSelectedId(v.id) : undefined)}
                style={{
                  cursor: v.status === 'IN_PROGRESS' || v.status === 'DONE' ? 'pointer' : 'default',
                  background: v.id === activeId ? '#f0fdfa' : undefined,
                  paddingInline: 8,
                  borderRadius: 8,
                }}
              >
                <Space>
                  <Typography.Text strong style={{ fontSize: 18, width: 32, display: 'inline-block' }}>{v.queueNumber}</Typography.Text>
                  <div>
                    <div>{v.patient.fullName}</div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {v.source === 'ONLINE' ? 'Đặt online' : 'Trực tiếp'} · {formatTime(v.createdAt)}
                    </Typography.Text>
                  </div>
                </Space>
                <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag>
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        {activeId ? (
          <VisitPanel key={activeId} visitId={activeId} onDone={() => setSelectedId(null)} />
        ) : (
          <Card>
            <Empty description="Bấm “Gọi số tiếp theo” để bắt đầu khám" />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function VisitPanel({ visitId, onDone }: { visitId: string; onDone: () => void }) {
  const detail = useQuery({
    queryKey: ['visit', visitId],
    queryFn: async () => (await api.get<VisitDetail>(`/visits/${visitId}`)).data,
  });
  const v = detail.data;
  const history = useQuery({
    queryKey: ['visit-history', v?.patient.id],
    enabled: !!v,
    queryFn: async () => (await api.get<VisitDetail[]>('/visits/history', { params: { patientId: v!.patient.id } })).data,
  });

  const [recordForm] = Form.useForm<RecordForm>();
  useEffect(() => {
    if (v?.medicalRecord) recordForm.setFieldsValue({ ...v.medicalRecord, orders: v.medicalRecord.orders ?? '' });
  }, [v?.medicalRecord, recordForm]);

  const saveRecord = useAction((r: RecordForm) => api.put(`/visits/${visitId}/record`, r), { success: 'Đã lưu bệnh án', invalidate: ['visit'] });
  const complete = useAction(() => api.post(`/visits/${visitId}/complete`), { success: 'Đã hoàn tất lượt khám', invalidate: ['queue', 'visit'] });
  const markLeft = useAction(() => api.patch(`/queue/${visitId}/left`), { success: 'Đã đánh dấu bỏ về', invalidate: ['queue'] });

  if (!v) return <Card loading />;
  const done = v.status === 'DONE';
  const draft = v.prescriptions?.find((p) => p.status === 'DRAFT') ?? null;
  const pastVisits = (history.data ?? []).filter((h) => h.id !== v.id);

  return (
    <Flex vertical gap={16}>
      <Card
        title={
          <Space>
            <Typography.Text strong style={{ fontSize: 20 }}>Số {v.queueNumber}</Typography.Text>
            <span>{v.patient.fullName}</span>
            <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag>
          </Space>
        }
        extra={
          !done && (
            <Popconfirm title="Bệnh nhân không có mặt? Đánh dấu bỏ về." okText="Đồng ý" cancelText="Hủy" onConfirm={() => markLeft.mutate(undefined, { onSuccess: onDone })}>
              <Button>Bỏ về</Button>
            </Popconfirm>
          )
        }
      >
        <Descriptions size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="Giới tính">{GENDER_LABEL[v.patient.gender]}</Descriptions.Item>
          <Descriptions.Item label="Tuổi">{age(v.patient.dateOfBirth)}</Descriptions.Item>
          <Descriptions.Item label="SĐT">{v.patient.phone}</Descriptions.Item>
          <Descriptions.Item label="Lý do khám" span={3}>{v.reason || '—'}</Descriptions.Item>
        </Descriptions>
        {v.patient.allergies && <Alert type="error" showIcon title={`Dị ứng: ${v.patient.allergies}`} style={{ marginTop: 8 }} />}
        {pastVisits.length > 0 && (
          <Collapse
            size="small"
            style={{ marginTop: 12 }}
            items={[
              {
                key: 'h',
                label: `Lịch sử khám (${pastVisits.length} lần)`,
                children: (
                  <List
                    size="small"
                    dataSource={pastVisits}
                    renderItem={(h) => (
                      <List.Item>
                        <div>
                          <Typography.Text strong>{formatDay(h.date)}</Typography.Text> · {h.medicalRecord?.diagnosis ?? 'Không có bệnh án'}
                          {h.prescription && (
                            <div>
                              <Typography.Text type="secondary">
                                Đơn: {h.prescription.items.map((i) => medicineLabel(i.medicine)).join(', ')}
                              </Typography.Text>
                            </div>
                          )}
                        </div>
                      </List.Item>
                    )}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="Bệnh án">
        <Form form={recordForm} layout="vertical" requiredMark={false} onFinish={(r) => saveRecord.mutate(r)}>
          <Form.Item label="Triệu chứng" name="symptoms" rules={[{ required: true, min: 2, message: 'Nhập triệu chứng' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Chẩn đoán" name="diagnosis" rules={[{ required: true, min: 2, message: 'Nhập chẩn đoán' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Chỉ định (xét nghiệm, tái khám…)" name="orders">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button htmlType="submit" loading={saveRecord.isPending}>
            {v.medicalRecord ? 'Cập nhật bệnh án' : 'Lưu bệnh án'}
          </Button>
        </Form>
      </Card>

      <PrescriptionCard visitId={visitId} draft={draft} current={v.prescription} />

      {!done && (
        <Card>
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Typography.Text type="secondary">
              {!v.medicalRecord ? 'Cần lưu bệnh án trước khi hoàn tất.' : draft ? 'Đơn thuốc đang là bản nháp: hoàn tất hoặc xóa đơn trước.' : 'Kiểm tra lại rồi hoàn tất lượt khám.'}
            </Typography.Text>
            <Button type="primary" size="large" disabled={!v.medicalRecord || !!draft} loading={complete.isPending} onClick={() => complete.mutate(undefined, { onSuccess: onDone })}>
              Hoàn tất lượt khám
            </Button>
          </Flex>
        </Card>
      )}
    </Flex>
  );
}

function PrescriptionCard({ visitId, draft, current }: { visitId: string; draft: Prescription | null; current: Prescription | null }) {
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<PrescriptionForm>();
  const showForm = editing || !!draft;

  useEffect(() => {
    if (draft) {
      form.setFieldsValue({
        advice: draft.advice ?? '',
        items: draft.items.map((i) => ({ medicineId: i.medicine.id, quantity: i.quantity, dosePerTime: i.dosePerTime, timesPerDay: i.timesPerDay, days: i.days, note: i.note ?? '' })),
      });
    }
  }, [draft, form]);

  const save = useAction(
    (p: PrescriptionForm) => (draft ? api.patch(`/prescriptions/${draft.id}`, p) : api.post(`/visits/${visitId}/prescriptions`, p)),
    { success: 'Đã lưu đơn nháp', invalidate: ['visit'] },
  );
  const finalize = useAction((id: string) => api.post(`/prescriptions/${id}/finalize`), { success: 'Đã hoàn tất đơn thuốc', invalidate: ['visit'] });
  const removeDraft = useAction((id: string) => api.delete(`/prescriptions/${id}`), { success: 'Đã xóa đơn nháp', invalidate: ['visit'] });

  const labels = new Map(draft?.items.map((i) => [i.medicine.id, medicineLabel(i.medicine)]));

  return (
    <Card
      title="Đơn thuốc"
      extra={draft ? <Tag color="gold">Bản nháp</Tag> : current ? <Tag color="green">Đã hoàn tất</Tag> : null}
    >
      {current && !draft && (
        <>
          <PrescriptionView p={current} />
          {!editing && (
            <Button style={{ marginTop: 12 }} onClick={() => setEditing(true)}>
              Kê đơn thay thế
            </Button>
          )}
        </>
      )}
      {!current && !showForm && (
        <Button icon={<PlusOutlined />} onClick={() => { form.setFieldsValue({ advice: '', items: [{} as ItemForm] }); setEditing(true); }}>
          Kê đơn
        </Button>
      )}
      {showForm && (
        <Form<PrescriptionForm>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ items: [{}] }}
          onFinish={(p) => save.mutate(p, { onSuccess: () => setEditing(false) })}
          style={{ marginTop: current ? 16 : 0 }}
        >
          {current && <Alert type="info" showIcon title="Đơn mới sẽ thay thế đơn đã hoàn tất sau khi bạn hoàn tất đơn mới." style={{ marginBottom: 12 }} />}
          <Form.List name="items" rules={[{ validator: async (_, items) => (items?.length ? undefined : Promise.reject(new Error('Thêm ít nhất một loại thuốc'))) }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Card key={key} size="small" style={{ marginBottom: 8, background: '#fafafa' }}>
                    <Row gutter={8}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Thuốc" name={[name, 'medicineId']} rules={[{ required: true, message: 'Chọn thuốc' }]}>
                          <MedicineSelect initialLabel={labels.get(form.getFieldValue(['items', name, 'medicineId']))} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item label="Mỗi lần" name={[name, 'dosePerTime']} rules={[{ required: true, message: 'Nhập liều' }]}>
                          <Input placeholder="1 viên" />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item label="Lần/ngày" name={[name, 'timesPerDay']} rules={[{ required: true, message: 'Nhập số lần' }]}>
                          <InputNumber min={1} max={12} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={8} md={4}>
                        <Form.Item label="Số ngày" name={[name, 'days']} rules={[{ required: true, message: 'Nhập số ngày' }]}>
                          <InputNumber min={1} max={90} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={8} md={4}>
                        <Form.Item noStyle shouldUpdate>
                          {() => (
                            <Form.Item
                              label="Số lượng"
                              name={[name, 'quantity']}
                              rules={[{ required: true, message: 'Nhập số lượng' }]}
                              extra={(() => {
                                const s = suggestQuantity(form.getFieldValue(['items', name, 'timesPerDay']), form.getFieldValue(['items', name, 'days']));
                                return s ? `Gợi ý: ${s}` : undefined;
                              })()}
                            >
                              <InputNumber min={1} max={1000} style={{ width: '100%' }} />
                            </Form.Item>
                          )}
                        </Form.Item>
                      </Col>
                      <Col xs={20} md={14}>
                        <Form.Item label="Ghi chú" name={[name, 'note']}>
                          <Input placeholder="Uống sau ăn" />
                        </Form.Item>
                      </Col>
                      <Col xs={4} md={2} style={{ display: 'flex', alignItems: 'center' }}>
                        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(name)} aria-label="Xóa dòng thuốc" />
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})} style={{ marginBottom: 8 }}>
                  Thêm thuốc
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
          <Form.Item label="Lời dặn" name="advice">
            <Input.TextArea rows={2} placeholder="Uống nhiều nước, tái khám sau 5 ngày…" />
          </Form.Item>
          <Space wrap>
            <Button htmlType="submit" loading={save.isPending}>Lưu nháp</Button>
            {draft && (
              <Button type="primary" loading={finalize.isPending} onClick={() => finalize.mutate(draft.id)}>
                Hoàn tất đơn
              </Button>
            )}
            {draft && (
              <Popconfirm title="Xóa đơn nháp?" okText="Xóa" cancelText="Hủy" onConfirm={() => removeDraft.mutate(draft.id)}>
                <Button danger>Xóa đơn nháp</Button>
              </Popconfirm>
            )}
            {!draft && <Button onClick={() => setEditing(false)}>Hủy</Button>}
          </Space>
          {draft && <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Lưu nháp trước, sau đó bấm “Hoàn tất đơn”. Đơn đã hoàn tất sẽ bị khóa và bệnh nhân xem được trên app.</Typography.Paragraph>}
        </Form>
      )}
    </Card>
  );
}

export function PrescriptionView({ p }: { p: Prescription }) {
  return (
    <>
      <List
        size="small"
        dataSource={p.items}
        renderItem={(i, idx) => (
          <List.Item>
            <div>
              <Typography.Text strong>{idx + 1}. {medicineLabel(i.medicine)}</Typography.Text> — SL: {i.quantity}
              <div>
                <Typography.Text type="secondary">
                  Mỗi lần {i.dosePerTime}, {i.timesPerDay} lần/ngày, {i.days} ngày{i.note ? ` · ${i.note}` : ''}
                </Typography.Text>
              </div>
            </div>
          </List.Item>
        )}
      />
      {p.advice && <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>Lời dặn: {p.advice}</Typography.Paragraph>}
    </>
  );
}
