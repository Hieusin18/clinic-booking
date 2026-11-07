import { DeleteOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
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
  Modal,
  Popconfirm,
  Radio,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import { C } from '../../lib/theme';
import { age, formatDay, formatTime, GENDER_LABEL, isToday, ticketLabel } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Prescription, ResultMode, Visit, VisitDetail } from '../../lib/types';
import { arrivalTag, byCallOrder, VISIT_STATUS } from '../reception/visitStatus';
import { MedicineSelect, medicineLabel } from './MedicineSelect';
import { LabCard } from './LabCard';
import { ExportButtons, RecordCard } from './RecordCard';

type ItemForm = { medicineId: string; quantity: number; dosePerTime: string; timesPerDay: number; days: number; note?: string };
type PrescriptionForm = { advice?: string; items: ItemForm[] };

/** Gợi ý số lượng cần mua khi bác sĩ chưa nhập: số lần/ngày × số ngày (giả định mỗi lần 1 đơn vị). */
export const suggestQuantity = (timesPerDay?: number, days?: number) => (timesPerDay && days ? timesPerDay * days : undefined);

/** Bác sĩ: hàng đợi hôm nay, gọi số, ghi bệnh án, kê đơn, hoàn tất lượt khám. */
export function ExamPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // WebSocket báo thay đổi ngay; hỏi lại định kỳ chỉ để dự phòng khi mất kết nối
  const { connected } = useRealtime();
  const queue = useQuery({
    queryKey: ['queue', 'doctor'],
    queryFn: async () => (await api.get<Visit[]>('/queue/doctor')).data,
    refetchInterval: connected ? 120_000 : 15_000,
  });
  // Người đang làm cận lâm sàng hiện ở thẻ riêng bên dưới (gồm cả các ngày trước)
  const list = [...(queue.data ?? [])].filter((v) => v.status !== 'AWAITING_RESULTS').sort(byCallOrder);
  const awaiting = useQuery({
    queryKey: ['queue', 'awaiting'],
    queryFn: async () => (await api.get<Visit[]>('/lab/awaiting-visits')).data,
    refetchInterval: connected ? 120_000 : 30_000,
  });
  const current = list.find((v) => v.status === 'IN_PROGRESS');
  const activeId = selectedId ?? current?.id ?? null;
  const waiting = list.filter((v) => v.status === 'WAITING').length;

  const callNext = useAction(async () => (await api.post<Visit>('/queue/call-next')).data, { invalidate: ['queue'] });
  const callOne = useAction(async (id: string) => (await api.post<Visit>(`/queue/${id}/call`)).data, { invalidate: ['queue'] });

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
            style={{ marginBottom: 8 }}
          >
            {current ? `Đang khám số ${ticketLabel(current)}` : waiting === 0 ? 'Không còn ai đang chờ' : 'Gọi số tiếp theo'}
          </Button>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
            Thứ tự gọi: người quay lại với kết quả cận lâm sàng được gọi trước; rồi người đặt lịch (số A) đã đến giờ hẹn; còn lại theo
            thứ tự đến quầy. Sau vài lượt ưu tiên giờ hẹn liên tiếp sẽ gọi một người vãng lai (số B) đang chờ.
          </Typography.Paragraph>
          <List
            loading={queue.isLoading}
            dataSource={list}
            locale={{ emptyText: 'Hôm nay chưa có bệnh nhân' }}
            renderItem={(v) => {
              const src = arrivalTag(v);
              return (
                <List.Item
                  onClick={() => (v.status === 'IN_PROGRESS' || v.status === 'DONE' ? setSelectedId(v.id) : undefined)}
                  style={{
                    cursor: v.status === 'IN_PROGRESS' || v.status === 'DONE' ? 'pointer' : 'default',
                    background: v.id === activeId ? C.stampSoft : undefined,
                    paddingInline: 8,
                    borderRadius: 8,
                  }}
                  actions={
                    v.status === 'WAITING' && !current
                      ? [
                          <Popconfirm
                            key="call"
                            title={`Gọi số ${ticketLabel(v)} ngay?`}
                            description="Bỏ qua thứ tự ưu tiên, dùng cho người già yếu, trẻ sốt cao hoặc người cần xem lại kết quả."
                            okText="Gọi"
                            cancelText="Hủy"
                            onConfirm={() => callOne.mutate(v.id, { onSuccess: (c) => setSelectedId(c.id) })}
                          >
                            <Button size="small" aria-label={`Gọi số ${ticketLabel(v)}`}>Gọi</Button>
                          </Popconfirm>,
                        ]
                      : undefined
                  }
                >
                  <Space align="start">
                    <span className="num" style={{ fontSize: 28, fontWeight: 700, lineHeight: '30px', width: 52, display: 'inline-block', color: v.source === 'ONLINE' ? C.stamp : C.ink }}>
                      {ticketLabel(v)}
                    </span>
                    <div>
                      <div>{v.patient.fullName}</div>
                      <Space size={4} wrap style={{ marginTop: 2 }}>
                        {v.status === 'WAITING' && v.predictedOrder === 0 ? <Tag style={{ background: C.ink, color: '#fff', borderColor: C.ink }}>Tiếp theo</Tag> : null}
                        <Tag color={src.color}>{src.label}</Tag>
                        {v.status !== 'WAITING' ? <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag> : null}
                      </Space>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Đến {formatTime(v.createdAt)}
                          {v.status === 'WAITING' && v.estimatedCallAt ? ` · dự kiến gọi ${formatTime(v.estimatedCallAt)}` : ''}
                        </Typography.Text>
                      </div>
                    </div>
                  </Space>
                </List.Item>
              );
            }}
          />
        </Card>
        <AwaitingCard visits={awaiting.data ?? []} activeId={activeId} onOpen={setSelectedId} />
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

/** Lượt đang chờ kết quả cận lâm sàng (mọi ngày): bấm để ghi kết quả, đưa vào hàng chờ hoặc hoàn tất online. */
function AwaitingCard({ visits, activeId, onOpen }: { visits: Visit[]; activeId: string | null; onOpen: (id: string) => void }) {
  if (visits.length === 0) return null;
  return (
    <Card title="Đang làm cận lâm sàng" style={{ marginTop: 16 }} extra={<Typography.Text type="secondary">{visits.length} lượt</Typography.Text>}>
      <List
        dataSource={visits}
        renderItem={(v) => {
          const total = v.labOrders?.length ?? 0;
          const ready = v.labOrders?.filter((o) => o.doneAt).length ?? 0;
          return (
            <List.Item
              onClick={() => onOpen(v.id)}
              style={{ cursor: 'pointer', background: v.id === activeId ? C.stampSoft : undefined, paddingInline: 8, borderRadius: 8 }}
            >
              <Space align="start">
                <span className="num" style={{ fontSize: 28, fontWeight: 700, lineHeight: '30px', width: 52, display: 'inline-block', color: C.muted }}>
                  {ticketLabel(v)}
                </span>
                <div>
                  <div>{v.patient.fullName}</div>
                  <Space size={4} wrap style={{ marginTop: 2 }}>
                    <Tag color={v.resultMode === 'ONLINE' ? 'processing' : 'purple'}>{v.resultMode === 'ONLINE' ? 'Nhận online' : 'Quay lại'}</Tag>
                    <Tag color={ready === total ? 'success' : 'warning'}>
                      Kết quả {ready}/{total}
                    </Tag>
                  </Space>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {v.labOrders?.map((o) => o.name).join(', ')}
                      {v.sentForTestsAt ? ` · gửi đi ${formatTime(v.sentForTestsAt)}${isToday(v.date) ? '' : ` ngày ${formatDay(v.date)}`}` : ''}
                    </Typography.Text>
                  </div>
                </div>
              </Space>
            </List.Item>
          );
        }}
      />
    </Card>
  );
}

const MODE_INFO: Record<ResultMode, { title: string; text: string }> = {
  RETURN: {
    title: 'Quay lại phòng khám',
    text: 'Làm xong bệnh nhân quay lại khu chờ, giữ nguyên số. Bác sĩ trả kết quả rồi đưa vào hàng chờ: được gọi trước mọi người để đọc kết quả, kết luận và kê đơn. Dùng khi cần kết quả để quyết định điều trị ngay hôm nay.',
  },
  ONLINE: {
    title: 'Nhận kết quả online',
    text: 'Bệnh nhân làm xong có thể ra về. Bác sĩ trả kết quả, kết luận, kê đơn rồi hoàn tất; bệnh nhân xem kết quả và đơn thuốc trên app. Nếu bất thường, ghi ngày hẹn tái khám để bệnh nhân đặt lịch.',
  },
};

/** Hộp chọn cách nhận kết quả khi gửi đi cận lâm sàng. */
function SendForTestsModal({ open, names, loading, onCancel, onSend }: { open: boolean; names: string[]; loading: boolean; onCancel: () => void; onSend: (m: ResultMode) => void }) {
  const [mode, setMode] = useState<ResultMode>('RETURN');
  return (
    <Modal title="Gửi đi làm cận lâm sàng" open={open} onCancel={onCancel} okText="Gửi đi" cancelText="Hủy" confirmLoading={loading} onOk={() => onSend(mode)} destroyOnHidden>
      <Typography.Paragraph>
        Chỉ định: <b>{names.join(', ')}</b>
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">Bệnh nhân nhận kết quả thế nào?</Typography.Paragraph>
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%' }}>
        <Flex vertical gap={10}>
          {(Object.keys(MODE_INFO) as ResultMode[]).map((m) => (
            <label
              key={m}
              style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, border: `1.5px solid ${mode === m ? C.stamp : C.line}`, background: mode === m ? C.stampSoft : '#fff', cursor: 'pointer' }}
            >
              <Radio value={m} />
              <div>
                <div style={{ fontWeight: 600 }}>{MODE_INFO[m].title}</div>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {MODE_INFO[m].text}
                </Typography.Text>
              </div>
            </label>
          ))}
        </Flex>
      </Radio.Group>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
        Sau khi gửi đi, bạn gọi được người tiếp theo. Lượt này nằm ở thẻ “Đang làm cận lâm sàng” bên trái.
      </Typography.Paragraph>
    </Modal>
  );
}

/** Một lượt khám: thông tin bệnh nhân, lịch sử, bệnh án, cận lâm sàng, đơn thuốc; dùng ở trang khám và trang tra cứu bệnh án. */
export function VisitPanel({ visitId, onDone }: { visitId: string; onDone: () => void }) {
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

  const complete = useAction(() => api.post(`/visits/${visitId}/complete`), { success: 'Đã hoàn tất lượt khám', invalidate: ['queue', 'visit'] });
  const sendForTests = useAction((mode: ResultMode) => api.post(`/visits/${visitId}/send-for-tests`, { mode }), {
    success: 'Đã gửi đi cận lâm sàng, bạn có thể gọi người tiếp theo',
    invalidate: ['queue', 'visit'],
  });
  const resultsReady = useAction(() => api.post(`/visits/${visitId}/results-ready`), {
    success: 'Đã đưa vào hàng chờ, lần gọi tới sẽ gọi bệnh nhân này trước',
    invalidate: ['queue', 'visit'],
  });
  const [sending, setSending] = useState(false);
  // Bệnh nhân chưa vào phòng: loa ở quầy đọc lại số
  const recall = useAction(() => api.post(`/queue/${visitId}/recall`), { success: 'Đã gọi lại trên loa ở quầy' });
  const markLeft = useAction(() => api.patch(`/queue/${visitId}/left`), { success: 'Đã đánh dấu bỏ về', invalidate: ['queue'] });

  if (!v) return <Card loading />;
  const done = v.status === 'DONE';
  const draft = v.prescriptions?.find((p) => p.status === 'DRAFT') ?? null;
  const pastVisits = (history.data ?? []).filter((h) => h.id !== v.id);
  const pendingLab = v.labOrders.filter((o) => !o.doneAt);
  const awaitingReturn = v.status === 'AWAITING_RESULTS' && v.resultMode === 'RETURN';
  const awaitingOnline = v.status === 'AWAITING_RESULTS' && v.resultMode === 'ONLINE';
  // Hoàn tất được khi đang khám, hoặc chờ kết quả theo chế độ online
  const canComplete = v.status === 'IN_PROGRESS' || awaitingOnline;
  const blocker = !v.medicalRecord
    ? 'Cần lưu bệnh án trước khi hoàn tất.'
    : pendingLab.length
      ? `Chưa trả kết quả: ${pendingLab.map((o) => o.name).join(', ')}.`
      : draft
        ? 'Đơn thuốc đang là bản nháp: hoàn tất hoặc xóa đơn trước.'
        : null;

  return (
    <Flex vertical gap={16}>
      <Card
        title={
          <Space>
            <span className="num" style={{ fontSize: 30, fontWeight: 700, color: C.stamp }}>{ticketLabel(v)}</span>
            <span>{v.patient.fullName}</span>
            <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag>
            {v.resultMode && v.status === 'AWAITING_RESULTS' && <Tag>{v.resultMode === 'ONLINE' ? 'Nhận kết quả online' : 'Sẽ quay lại'}</Tag>}
          </Space>
        }
        extra={
          !done && (
            <Space>
              {v.status === 'IN_PROGRESS' && (
                <Button icon={<SoundOutlined />} loading={recall.isPending} onClick={() => recall.mutate(undefined)}>
                  Gọi lại
                </Button>
              )}
              <Popconfirm title="Bệnh nhân không có mặt? Đánh dấu bỏ về." okText="Đồng ý" cancelText="Hủy" onConfirm={() => markLeft.mutate(undefined, { onSuccess: onDone })}>
                <Button>Bỏ về</Button>
              </Popconfirm>
            </Space>
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
                      <List.Item extra={h.medicalRecord && <ExportButtons visitId={h.id} size="small" />}>
                        <div>
                          <Typography.Text strong>{formatDay(h.date)}</Typography.Text> · {h.medicalRecord?.diagnosis ?? 'Không có bệnh án'}
                          {h.medicalRecord?.icdCode && <Typography.Text type="secondary"> ({h.medicalRecord.icdCode})</Typography.Text>}
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

      <RecordCard visitId={visitId} visitDate={v.date} reason={v.reason} record={v.medicalRecord} />

      <LabCard visitId={visitId} orders={v.labOrders} readOnly={done} />

      <PrescriptionCard visitId={visitId} draft={draft} current={v.prescription} />

      {!done && (
        <Card>
          {awaitingReturn ? (
            <Flex justify="space-between" align="center" wrap gap={12}>
              <Typography.Text type="secondary" style={{ maxWidth: 520 }}>
                {pendingLab.length
                  ? `Bệnh nhân đang đi làm cận lâm sàng và sẽ quay lại. Trả kết quả: ${pendingLab.map((o) => o.name).join(', ')}, rồi đưa vào hàng chờ.`
                  : 'Đã đủ kết quả. Đưa vào hàng chờ: lần gọi tới sẽ gọi bệnh nhân này trước để đọc kết quả.'}
              </Typography.Text>
              <Button type="primary" size="large" disabled={pendingLab.length > 0} loading={resultsReady.isPending} onClick={() => resultsReady.mutate(undefined, { onSuccess: onDone })}>
                Đưa vào hàng chờ đọc kết quả
              </Button>
            </Flex>
          ) : (
            <Flex justify="space-between" align="center" wrap gap={12}>
              <Typography.Text type="secondary" style={{ maxWidth: 520 }}>
                {awaitingOnline
                  ? blocker ?? 'Bệnh nhân nhận kết quả online. Hoàn tất để gửi kết quả, chẩn đoán và đơn thuốc lên app.'
                  : pendingLab.length
                    ? `Còn ${pendingLab.length} chỉ định chưa có kết quả: gửi bệnh nhân đi làm để gọi người tiếp theo, hoặc trả kết quả ngay nếu đã có.`
                    : blocker ?? 'Kiểm tra lại rồi hoàn tất lượt khám.'}
              </Typography.Text>
              <Space wrap>
                {v.status === 'IN_PROGRESS' && pendingLab.length > 0 && (
                  <Button size="large" onClick={() => setSending(true)}>
                    Gửi đi cận lâm sàng
                  </Button>
                )}
                <Button type="primary" size="large" disabled={!canComplete || !!blocker} loading={complete.isPending} onClick={() => complete.mutate(undefined, { onSuccess: onDone })}>
                  {awaitingOnline ? 'Hoàn tất và gửi lên app' : 'Hoàn tất lượt khám'}
                </Button>
              </Space>
            </Flex>
          )}
        </Card>
      )}
      <SendForTestsModal
        open={sending}
        names={pendingLab.map((o) => o.name)}
        loading={sendForTests.isPending}
        onCancel={() => setSending(false)}
        onSend={(mode) =>
          sendForTests.mutate(mode, {
            onSuccess: () => {
              setSending(false);
              onDone();
            },
          })
        }
      />
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
      extra={draft ? <Tag color="warning">Bản nháp</Tag> : current ? <Tag color="success">Đã hoàn tất</Tag> : null}
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
      {p.code && <Typography.Text type="secondary">Mã đơn thuốc: {p.code}</Typography.Text>}
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
