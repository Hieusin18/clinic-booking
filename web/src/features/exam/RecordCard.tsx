import { EyeOutlined, FilePdfOutlined, FileWordOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, AutoComplete, Button, Card, Col, DatePicker, Divider, Flex, Form, Input, InputNumber, Modal, Row, Space, Spin, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import type { MedicalRecord } from '../../lib/types';

/** Giá trị form: ngày tái khám dùng Dayjs, còn lại giống bệnh án. */
export type RecordForm = Omit<MedicalRecord, 'id' | 'followUpDate'> & { followUpDate?: Dayjs | null };

/** Chuyển form sang dữ liệu gửi API: ngày → "YYYY-MM-DD", ô trống → null để xóa giá trị cũ. */
export function toRecordPayload(f: RecordForm) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'followUpDate') out[k] = v ? (v as Dayjs).format('YYYY-MM-DD') : null;
    else if ((k === 'icdCode' || k === 'secondaryIcdCodes') && typeof v === 'string') out[k] = v.trim().toUpperCase() || null;
    else out[k] = v === undefined || v === '' ? null : v;
  }
  return out;
}

/** BMI = cân nặng (kg) / chiều cao (m)², làm tròn 1 chữ số. */
export const bmi = (weight?: number | null, height?: number | null) =>
  weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null;

/** Lưu một Blob thành file trên máy. */
function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Tải file từ API (có token): trả về nội dung và tên file server đặt. */
async function fetchFile(url: string, fallbackName: string) {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? fallbackName;
  return { blob: res.data, name };
}

/** Xem trước bệnh án + đơn thuốc đúng bố cục bản in (trang HTML do máy chủ tạo), kèm nút tải PDF/Word. */
function PreviewModal({ visitId, open, onClose }: { visitId: string; open: boolean; onClose: () => void }) {
  const html = useQuery({
    queryKey: ['record-html', visitId],
    enabled: open,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => (await api.get<string>(`/visits/${visitId}/record.html`, { responseType: 'text' })).data,
  });
  return (
    <Modal
      title="Xem trước bản điện tử"
      open={open}
      onCancel={onClose}
      width={900}
      destroyOnHidden
      styles={{ body: { height: '72vh' } }}
      footer={
        <Flex justify="space-between" align="center" wrap gap={8}>
          <Typography.Text type="secondary">Nội dung theo bệnh án và đơn thuốc đã lưu</Typography.Text>
          <Space>
            <Button onClick={onClose}>Đóng</Button>
            <DownloadButtons visitId={visitId} primary />
          </Space>
        </Flex>
      }
    >
      {html.isError ? (
        <Alert type="error" showIcon title={errorMessage(html.error)} />
      ) : html.data ? (
        // sandbox rỗng: trang xem trước không chạy script, không điều hướng; máy chủ đã thoát ký tự HTML
        <iframe title="Bản xem trước bệnh án" srcDoc={html.data} sandbox="" style={{ width: '100%', height: '100%', border: '1px solid #e5e7eb', borderRadius: 8 }} />
      ) : (
        <Flex align="center" justify="center" style={{ height: '100%' }}>
          <Spin />
        </Flex>
      )}
    </Modal>
  );
}

function DownloadButtons({ visitId, size, primary }: { visitId: string; size?: 'small' | 'middle'; primary?: boolean }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null);
  const get = async (format: 'pdf' | 'docx') => {
    setBusy(format);
    try {
      const f = await fetchFile(`/visits/${visitId}/record.${format}`, `benh-an.${format}`);
      saveBlob(f.blob, f.name);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Button size={size} icon={<FileWordOutlined />} loading={busy === 'docx'} onClick={() => get('docx')}>
        Tải Word
      </Button>
      <Button size={size} type={primary ? 'primary' : 'default'} icon={<FilePdfOutlined />} loading={busy === 'pdf'} onClick={() => get('pdf')}>
        Tải PDF
      </Button>
    </>
  );
}

/** Nút xem trước, tải bệnh án + đơn thuốc dạng PDF và Word. */
export function ExportButtons({ visitId, size }: { visitId: string; size?: 'small' | 'middle' }) {
  const [previewing, setPreviewing] = useState(false);
  return (
    <Space size="small">
      <Button size={size} type="primary" ghost icon={<EyeOutlined />} onClick={() => setPreviewing(true)}>
        Xem trước
      </Button>
      <DownloadButtons visitId={visitId} size={size} />
      <PreviewModal visitId={visitId} open={previewing} onClose={() => setPreviewing(false)} />
    </Space>
  );
}

/** Ô nhập mã ICD-10: gõ mã hoặc tên bệnh (không cần dấu) để chọn trong danh mục, hoặc tự nhập mã. */
function IcdInput({ id, value, onChange, onPick }: { id?: string; value?: string; onChange?: (v: string) => void; onPick?: (name: string) => void }) {
  const [q, setQ] = useState('');
  const options = useQuery({
    queryKey: ['icd10', q],
    queryFn: async () => (await api.get<{ code: string; name: string }[]>('/icd10', { params: { q } })).data,
    staleTime: Infinity,
  });
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={(v) => onChange?.(v)}
      onSearch={setQ}
      onSelect={(code: string) => onPick?.(options.data?.find((o) => o.code === code)?.name ?? '')}
      options={options.data?.map((o) => ({ value: o.code, label: `${o.code} – ${o.name}` }))}
      placeholder="Gõ mã hoặc tên bệnh, vd. viem hong"
      popupMatchSelectWidth={420}
      allowClear
    />
  );
}

const Section = ({ children }: { children: string }) => (
  <Divider titlePlacement="start" style={{ margin: '8px 0 12px' }}>
    <Typography.Text strong>{children}</Typography.Text>
  </Divider>
);

const num = (min: number, max: number, unit: string, step = 1) => (
  <InputNumber min={min} max={max} step={step} addonAfter={unit} style={{ width: '100%' }} />
);

/** Bệnh án ngoại trú: hỏi bệnh, khám (sinh hiệu), chẩn đoán ICD-10, điều trị; tải bản PDF/Word. */
export function RecordCard({ visitId, visitDate, reason, record }: { visitId: string; visitDate: string; reason: string | null; record: MedicalRecord | null }) {
  const [form] = Form.useForm<RecordForm>();
  useEffect(() => {
    if (record) {
      const { id: _id, followUpDate, ...rest } = record;
      form.setFieldsValue({ ...rest, followUpDate: followUpDate ? dayjs(followUpDate.slice(0, 10)) : null });
    } else {
      form.setFieldsValue({ reason: reason ?? '' });
    }
  }, [record, reason, form]);

  const save = useAction((f: RecordForm) => api.put(`/visits/${visitId}/record`, toRecordPayload(f)), { success: 'Đã lưu bệnh án', invalidate: ['visit'] });
  const weight = Form.useWatch('weight', form);
  const height = Form.useWatch('height', form);
  const index = bmi(weight, height);

  return (
    <Card title="Bệnh án ngoại trú" extra={record && <ExportButtons visitId={visitId} size="small" />}>
      <Form<RecordForm> form={form} layout="vertical" requiredMark={false} onFinish={(f) => save.mutate(f)}>
        <Section>Hỏi bệnh</Section>
        <Form.Item label="Lý do đến khám" name="reason">
          <Input />
        </Form.Item>
        <Form.Item label="Quá trình bệnh lý" name="symptoms" rules={[{ required: true, min: 2, message: 'Nhập quá trình bệnh lý / triệu chứng' }]}>
          <Input.TextArea rows={3} placeholder="Khởi phát, diễn biến, triệu chứng, đã điều trị gì…" />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item label="Tiền sử bản thân" name="personalHistory">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Tiền sử gia đình" name="familyHistory">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>

        <Section>Khám bệnh</Section>
        <Row gutter={12}>
          <Col xs={12} md={6}>
            <Form.Item label="Mạch" name="pulse">{num(20, 250, 'l/ph')}</Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Nhiệt độ" name="temperature">{num(30, 45, '°C', 0.1)}</Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              label="Huyết áp tâm thu"
              name="bpSystolic"
              dependencies={['bpDiastolic']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v) => ((v == null) === (getFieldValue('bpDiastolic') == null) ? Promise.resolve() : Promise.reject(new Error('Nhập đủ cả 2 số huyết áp'))),
                }),
              ]}
            >
              {num(40, 300, 'mmHg')}
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Huyết áp tâm trương" name="bpDiastolic">{num(20, 200, 'mmHg')}</Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Nhịp thở" name="respiratoryRate">{num(5, 80, 'l/ph')}</Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="SpO₂" name="spo2">{num(50, 100, '%')}</Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Cân nặng" name="weight">{num(0.5, 400, 'kg', 0.1)}</Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Chiều cao" name="height" extra={index ? `BMI: ${index}` : undefined}>
              {num(30, 250, 'cm')}
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Toàn thân" name="generalExam">
          <Input.TextArea rows={2} placeholder="Tri giác, da niêm mạc, hạch, phù…" />
        </Form.Item>
        <Form.Item label="Các bộ phận" name="organExam">
          <Input.TextArea rows={2} placeholder="Tim, phổi, bụng, tai mũi họng…" />
        </Form.Item>
        {/* Chỉ định cận lâm sàng nay ở thẻ "Cận lâm sàng"; ghi chú chỉ định của bệnh án cũ vẫn hiện để tham khảo */}
        {record?.orders && (
          <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
            Ghi chú chỉ định (bệnh án cũ): {record.orders}
          </Typography.Paragraph>
        )}
        <Form.Item label="Tóm tắt kết quả cận lâm sàng" name="labSummary" extra="Kết quả chi tiết và ảnh ghi ở thẻ Cận lâm sàng bên dưới">
          <Input.TextArea rows={2} placeholder="Ví dụ: X-quang có đám mờ thùy dưới phổi phải" />
        </Form.Item>

        <Section>Chẩn đoán</Section>
        <Row gutter={12}>
          <Col xs={24} md={16}>
            <Form.Item label="Bệnh chính" name="diagnosis" rules={[{ required: true, min: 2, message: 'Nhập chẩn đoán' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Mã ICD-10" name="icdCode" rules={[{ pattern: /^\s*[A-Z]\d{2}(\.\d{1,2})?\s*$/i, message: 'Chọn trong danh sách hoặc nhập mã dạng J02.9' }]}>
              <IcdInput onPick={(name) => !form.getFieldValue('diagnosis') && form.setFieldValue('diagnosis', name)} />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item label="Bệnh kèm theo" name="secondaryDiagnosis">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Mã ICD-10 bệnh kèm theo"
              name="secondaryIcdCodes"
              rules={[{ pattern: /^\s*[A-Z]\d{2}(\.\d{1,2})?(\s*,\s*[A-Z]\d{2}(\.\d{1,2})?)*\s*$/i, message: 'Các mã cách nhau dấu phẩy' }]}
            >
              <Input placeholder="J30.4, J31.0" />
            </Form.Item>
          </Col>
        </Row>

        <Section>Điều trị</Section>
        <Row gutter={12}>
          <Col xs={24} md={16}>
            <Form.Item label="Hướng xử trí, điều trị" name="treatment">
              <Input.TextArea rows={2} placeholder="Điều trị ngoại trú, theo dõi…" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Hẹn tái khám" name="followUpDate">
              <DatePicker
                placeholder="Chọn ngày"
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
                disabledDate={(d) => !d.isAfter(dayjs(visitDate.slice(0, 10)), 'day')}
              />
            </Form.Item>
          </Col>
        </Row>
        <Button htmlType="submit" type="primary" ghost loading={save.isPending}>
          {record ? 'Cập nhật bệnh án' : 'Lưu bệnh án'}
        </Button>
      </Form>
    </Card>
  );
}
