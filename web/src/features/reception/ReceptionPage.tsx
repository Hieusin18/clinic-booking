import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Descriptions, Empty, Form, Input, List, Modal, Row, Select, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { api, errorData } from '../../lib/api';
import { age, doctorName, formatDay, formatTime, GENDER_LABEL, ticketLabel } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Appointment, Gender, Page, Patient, Visit } from '../../lib/types';
import { useRealtime } from '../../lib/realtime';
import { C } from '../../lib/theme';
import { TicketModal } from './TicketPrint';
import { useDoctorOptions } from './useDoctorOptions';

type NewPatient = {
  fullName: string;
  phone: string;
  dateOfBirth: Dayjs;
  gender: Gender;
  nationalId?: string;
  insuranceNo?: string;
  insuranceExpiry?: Dayjs | null;
  address?: string;
  allergies?: string;
  occupation?: string;
  ethnicity?: string;
  relativeName?: string;
  relativePhone?: string;
};

/** Lễ tân: tìm hoặc tạo hồ sơ, cấp số cho người đến trực tiếp, check-in người đã đặt lịch. */
export function ReceptionPage() {
  const [term, setTerm] = useState('');
  const { connected } = useRealtime();
  const [selected, setSelected] = useState<Patient | null>(null);
  const [creating, setCreating] = useState(false);
  /** Giá trị điền sẵn khi mở form tạo hồ sơ (form được tạo lại mỗi lần mở) */
  const [prefill, setPrefill] = useState<Partial<NewPatient>>({});
  const [ticket, setTicket] = useState<Visit | null>(null);
  const [createForm] = Form.useForm<NewPatient>();
  const [ticketForm] = Form.useForm<{ doctorId: string; reason?: string }>();
  const doctors = useDoctorOptions();

  const results = useQuery({
    queryKey: ['patients', term],
    enabled: term.length >= 3,
    queryFn: async () => (await api.get<Page<Patient>>('/patients', { params: { q: term, pageSize: 10 } })).data.items,
  });
  const appointments = useQuery({
    queryKey: ['appointments', 'today'],
    queryFn: async () => (await api.get<Appointment[]>('/appointments')).data,
    refetchInterval: connected ? 120_000 : 30_000,
  });

  const create = useAction(
    async (v: NewPatient) =>
      (
        await api.post<Patient>('/patients', {
          ...v,
          dateOfBirth: v.dateOfBirth.format('YYYY-MM-DD'),
          nationalId: v.nationalId || undefined,
          insuranceNo: v.insuranceNo || undefined,
          address: v.address || undefined,
          allergies: v.allergies || undefined,
          insuranceExpiry: v.insuranceExpiry ? v.insuranceExpiry.format('YYYY-MM-DD') : undefined,
          occupation: v.occupation || undefined,
          ethnicity: v.ethnicity || undefined,
          relativeName: v.relativeName || undefined,
          relativePhone: v.relativePhone || undefined,
        })
      ).data,
    { success: 'Đã tạo hồ sơ bệnh nhân', invalidate: ['patients'] },
  );
  const issue = useAction(
    async (v: { patientId: string; doctorId: string; reason?: string }) => (await api.post<Visit>('/queue/tickets', v)).data,
    { invalidate: ['queue'] },
  );
  const { modal } = App.useApp();
  const checkIn = useAction(
    async ({ id, override }: { id: string; override?: boolean }) =>
      (await api.post<Visit>('/queue/checkin', { appointmentId: id, ...(override ? { override: true } : {}) })).data,
    {
      invalidate: ['appointments', 'queue'],
      // Ngoài khung giờ check-in: hỏi lễ tân có muốn check-in ngoài giờ không
      handleError: (err, vars) => {
        const data = errorData<{ appointmentAt?: string; opensAt?: string; closesAt?: string }>(err);
        const early = data?.code === 'CHECKIN_TOO_EARLY';
        if (!early && data?.code !== 'CHECKIN_TOO_LATE') return false;
        const at = data.appointmentAt ? formatTime(data.appointmentAt) : '';
        modal.confirm({
          title: early ? 'Bệnh nhân đến sớm hơn khung check-in' : 'Bệnh nhân đến trễ quá khung check-in',
          content: (
            <>
              <p>
                {early
                  ? `Lịch hẹn lúc ${at}, khung check-in mở từ ${data.opensAt ? formatTime(data.opensAt) : ''}.`
                  : `Lịch hẹn lúc ${at}, khung check-in đã đóng lúc ${data.closesAt ? formatTime(data.closesAt) : ''} nên lịch hẹn được tính là không đến.`}
              </p>
              <p>
                {early
                  ? 'Vẫn check-in ngay? Bệnh nhân giữ số A và được ưu tiên khi đến giờ hẹn.'
                  : 'Vẫn check-in theo lịch hẹn (giữ số A, có ưu tiên)? Nếu không, hãy cấp số thường ở khung bên trái.'}
              </p>
            </>
          ),
          okText: 'Check-in ngoài giờ',
          cancelText: 'Không',
          onOk: () => checkIn.mutate({ id: vars.id, override: true }, { onSuccess: setTicket }),
        });
        appointments.refetch();
        return true;
      },
    },
  );

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={14}>
        <Card title="Tiếp đón bệnh nhân">
          <Input.Search
            size="large"
            placeholder="Nhập SĐT, số CCCD hoặc tên (ít nhất 3 ký tự)"
            allowClear
            enterButton="Tìm"
            onSearch={(v) => {
              setTerm(v.trim());
              setSelected(null);
            }}
          />
          {term.length >= 3 && (
            <List
              style={{ marginTop: 12 }}
              loading={results.isFetching}
              dataSource={results.data ?? []}
              locale={{
                emptyText: (
                  <Empty description="Chưa có hồ sơ">
                    <Button
                      type="primary"
                      onClick={() => {
                        setPrefill(/^\d{10}$/.test(term) ? { phone: term } : /^\d{12}$/.test(term) ? { nationalId: term } : { fullName: term });
                        setCreating(true);
                      }}
                    >
                      Tạo hồ sơ mới
                    </Button>
                  </Empty>
                ),
              }}
              renderItem={(p) => (
                <List.Item
                  actions={[<Button key="choose" type={selected?.id === p.id ? 'primary' : 'default'} onClick={() => setSelected(p)}>Chọn</Button>]}
                >
                  <List.Item.Meta
                    title={p.fullName}
                    description={`${p.phone} · ${GENDER_LABEL[p.gender]} · ${age(p.dateOfBirth)} tuổi${p.nationalId ? ` · CCCD ${p.nationalId}` : ''}`}
                  />
                </List.Item>
              )}
            />
          )}
          {term.length >= 3 && (results.data?.length ?? 0) > 0 && (
            <Button
              type="link"
              onClick={() => {
                setPrefill({});
                setCreating(true);
              }}
            >
              + Tạo hồ sơ khác
            </Button>
          )}

          {selected && (
            <Card type="inner" title="Cấp số thứ tự" style={{ marginTop: 16 }}>
              <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
                <Descriptions.Item label="Bệnh nhân">{selected.fullName}</Descriptions.Item>
                <Descriptions.Item label="Ngày sinh">{formatDay(selected.dateOfBirth)}</Descriptions.Item>
                <Descriptions.Item label="SĐT">{selected.phone}</Descriptions.Item>
                <Descriptions.Item label="BHYT">{selected.insuranceNo || '—'}</Descriptions.Item>
              </Descriptions>
              {selected.allergies && <Alert type="warning" showIcon title={`Dị ứng: ${selected.allergies}`} style={{ marginBottom: 12 }} />}
              <Form
                form={ticketForm}
                layout="vertical"
                requiredMark={false}
                onFinish={(v) =>
                  issue.mutate(
                    { patientId: selected.id, ...v },
                    {
                      onSuccess: (visit) => {
                        setTicket(visit);
                        ticketForm.resetFields();
                        setSelected(null);
                      },
                    },
                  )
                }
              >
                <Form.Item label="Bác sĩ" name="doctorId" rules={[{ required: true, message: 'Chọn bác sĩ' }]}>
                  <Select showSearch optionFilterProp="label" options={doctors.options} placeholder="Chọn bác sĩ theo chuyên khoa" />
                </Form.Item>
                <Form.Item label="Lý do khám" name="reason">
                  <Input.TextArea rows={2} maxLength={500} />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" loading={issue.isPending}>
                  Cấp số thường (B)
                </Button>
              </Form>
            </Card>
          )}
        </Card>
      </Col>

      <Col xs={24} xl={10}>
        <Card title="Lịch hẹn hôm nay" extra={<Typography.Text type="secondary">{appointments.data?.length ?? 0} lịch</Typography.Text>}>
          <List
            loading={appointments.isLoading}
            dataSource={appointments.data ?? []}
            locale={{ emptyText: 'Hôm nay chưa có lịch hẹn' }}
            renderItem={(a) => {
              // Lịch hẹn chưa tới khung check-in: chỉ báo giờ mở, lễ tân vẫn bấm được (sẽ hỏi check-in ngoài giờ)
              const early = !a.visit && a.status !== 'NO_SHOW' && a.checkinOpensAt && new Date(a.checkinOpensAt).getTime() > Date.now();
              return (
                <List.Item
                  actions={[
                    a.visit ? (
                      <span key="no" className="num" aria-label={`Đã check-in, số ${ticketLabel(a.visit)}`} style={{ fontSize: 22, fontWeight: 700, color: C.good, background: C.goodSoft, borderRadius: 8, padding: '0 10px' }}>
                        {ticketLabel(a.visit)}
                      </span>
                    ) : early ? (
                      <Button key="checkin" onClick={() => checkIn.mutate({ id: a.id }, { onSuccess: setTicket })} loading={checkIn.isPending && checkIn.variables?.id === a.id}>
                        Mở check-in {formatTime(a.checkinOpensAt!)}
                      </Button>
                    ) : (
                      <Button
                        key="checkin"
                        type="primary"
                        loading={checkIn.isPending && checkIn.variables?.id === a.id}
                        onClick={() => checkIn.mutate({ id: a.id }, { onSuccess: setTicket })}
                      >
                        Check-in
                      </Button>
                    ),
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <span className="num" style={{ fontSize: 26, fontWeight: 600, lineHeight: '32px', color: a.visit || early ? C.muted : C.ink, display: 'inline-block', width: 58 }}>
                        {formatTime(a.schedule.startTime)}
                      </span>
                    }
                    title={a.patient.fullName}
                    description={
                      <>
                        {doctorName(a.schedule.doctor)} · {a.patient.phone}
                        {a.status === 'NO_SHOW' && !a.visit ? (
                          <Tag color="warning" style={{ marginLeft: 8 }}>
                            Quá giờ, chưa đến
                          </Tag>
                        ) : null}
                      </>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      </Col>

      <Modal
        title="Tạo hồ sơ bệnh nhân"
        open={creating}
        okText="Tạo hồ sơ"
        cancelText="Hủy"
        width={640}
        confirmLoading={create.isPending}
        onCancel={() => setCreating(false)}
        onOk={() =>
          createForm
            .validateFields()
            .then((v) => create.mutateAsync(v))
            .then((p) => {
              setCreating(false);
              setSelected(p);
            })
            .catch(() => {})
        }
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" requiredMark={false} initialValues={prefill}>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true, min: 2, message: 'Nhập họ tên' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Số điện thoại" name="phone" rules={[{ required: true, pattern: /^0\d{9}$/, message: 'SĐT gồm 10 chữ số, bắt đầu bằng 0' }]}>
                <Input inputMode="tel" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Ngày sinh" name="dateOfBirth" rules={[{ required: true, message: 'Chọn ngày sinh' }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Giới tính" name="gender" rules={[{ required: true, message: 'Chọn giới tính' }]}>
                <Select options={(Object.keys(GENDER_LABEL) as Gender[]).map((g) => ({ value: g, label: GENDER_LABEL[g] }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Số CCCD" name="nationalId" rules={[{ pattern: /^\d{12}$/, message: 'CCCD gồm 12 chữ số' }]}>
                <Input inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Nghề nghiệp" name="occupation">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Dân tộc" name="ethnicity">
                <Input placeholder="Kinh" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Mã thẻ BHYT" name="insuranceNo">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="BHYT giá trị đến" name="insuranceExpiry">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Địa chỉ" name="address">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Người nhà (báo tin / đưa trẻ đến khám)" name="relativeName">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="SĐT người nhà" name="relativePhone" rules={[{ pattern: /^0\d{9}$/, message: 'SĐT gồm 10 chữ số, bắt đầu bằng 0' }]}>
                <Input inputMode="tel" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Tiền sử dị ứng" name="allergies">
                <Input placeholder="Thuốc, thức ăn… (để trống nếu không có)" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <TicketModal visit={ticket} onClose={() => setTicket(null)} />
    </Row>
  );
}
