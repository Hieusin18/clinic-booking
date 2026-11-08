import { CheckCircleFilled, CloseCircleOutlined, MessageOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Flex, Form, Input, Table, Tag, Typography } from 'antd';
import { api } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { NUM } from '../../lib/theme';
import { PageHeader } from './PageHeader';

interface SmsConfig {
  smsTo: string | null;
  simulator: boolean;
  iphoneShortcut: boolean;
  androidGateway: boolean;
  prefix: string;
}
interface Pending {
  id: string;
  phone: string;
  purpose: 'REGISTER' | 'RESET_PASSWORD';
  code: string;
  expiresAt: string;
}
interface Inbound {
  id: string;
  source: string;
  fromRaw: string;
  phone: string | null;
  body: string;
  result: string;
  receivedAt: string;
}

const SOURCE: Record<string, string> = { SIMULATOR: 'Giả lập', IOS_SHORTCUT: 'iPhone Phím tắt', ANDROID_GATEWAY: 'Android Gateway' };
const RESULT: Record<string, { label: string; color: string }> = {
  VERIFIED: { label: 'Đã xác minh', color: 'success' },
  WRONG_SENDER: { label: 'Sai số người gửi', color: 'error' },
  INVALID_SENDER: { label: 'Người gửi không phải số ĐT', color: 'warning' },
  NO_MATCH: { label: 'Không khớp mã', color: 'default' },
};
const PURPOSE = { REGISTER: 'Đăng ký', RESET_PASSWORD: 'Quên mật khẩu' };

const Yes = ({ on, label }: { on: boolean; label: string }) => (
  <span>
    {on ? <CheckCircleFilled style={{ color: '#2E7A57' }} /> : <CloseCircleOutlined style={{ color: '#9AA3B5' }} />} {label}
  </span>
);

/**
 * Tin nhắn xác minh số điện thoại (backend/src/sms/phone-verify.ts): bệnh nhân nhắn "PKXM <mã>" tới số của
 * phòng khám; cổng SMS (iPhone Phím tắt / Android) chuyển tin về máy chủ. Chưa có cổng thì admin giả lập ở đây.
 */
export function SmsPage() {
  const config = useQuery({ queryKey: ['sms', 'config'], queryFn: async () => (await api.get<SmsConfig>('/sms/config')).data });
  const pending = useQuery({ queryKey: ['sms', 'pending'], queryFn: async () => (await api.get<Pending[]>('/sms/pending')).data, refetchInterval: 3000 });
  const inbound = useQuery({ queryKey: ['sms', 'inbound'], queryFn: async () => (await api.get<Inbound[]>('/sms/inbound')).data, refetchInterval: 3000 });
  const simulate = useAction((body: { from: string; body: string }) => api.post<{ result: string }>('/sms/simulate', body), {
    invalidate: ['sms'],
    success: 'Đã giả lập tin nhắn đến',
  });
  const [form] = Form.useForm<{ from: string; body: string }>();
  const c = config.data;

  return (
    <>
      <PageHeader title="Tin nhắn xác minh" />
      <Flex vertical gap={16}>
        {c && (
          <Card size="small">
            <Descriptions size="small" column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Số nhận tin (SMS_VERIFY_NUMBER)">
                {c.smsTo ? (
                  <span style={{ fontFamily: NUM, fontSize: 18, fontWeight: 600 }}>{c.smsTo}</span>
                ) : (
                  <Typography.Text type="warning">chưa cấu hình</Typography.Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Cú pháp tin nhắn">
                <span style={{ fontFamily: NUM, fontSize: 18 }}>{c.prefix} &lt;mã 6 số&gt;</span>
              </Descriptions.Item>
              <Descriptions.Item label="Nguồn nhận tin">
                <Flex gap={16} wrap>
                  <Yes on={c.iphoneShortcut} label="iPhone Phím tắt" />
                  <Yes on={c.androidGateway} label="Android Gateway" />
                  <Yes on={c.simulator} label="Giả lập" />
                </Flex>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {c?.simulator && (
          <Card title="Đang chờ tin nhắn" extra={<Typography.Text type="secondary">Chỉ hiện khi bật giả lập</Typography.Text>}>
            <Table
              size="small"
              rowKey="id"
              loading={pending.isLoading}
              dataSource={pending.data ?? []}
              pagination={false}
              locale={{ emptyText: 'Không có phiên nào đang chờ' }}
              columns={[
                { title: 'Số điện thoại', dataIndex: 'phone', render: (p: string) => <span style={{ fontFamily: NUM, fontSize: 16 }}>{p}</span> },
                { title: 'Mục đích', dataIndex: 'purpose', render: (p: Pending['purpose']) => PURPOSE[p] },
                { title: 'Mã', dataIndex: 'code', render: (code: string) => <span style={{ fontFamily: NUM, fontSize: 18, fontWeight: 600 }}>{code}</span> },
                { title: 'Hết hạn', dataIndex: 'expiresAt', render: formatTime },
                {
                  title: '',
                  render: (_, p) => (
                    <Button
                      size="small"
                      type="primary"
                      icon={<MessageOutlined />}
                      loading={simulate.isPending}
                      onClick={() => simulate.mutate({ from: p.phone, body: `${c.prefix} ${p.code}` })}
                    >
                      Giả lập tin nhắn
                    </Button>
                  ),
                },
              ]}
            />
            <Form
              form={form}
              layout="inline"
              style={{ marginTop: 16, rowGap: 8 }}
              onFinish={(v) => simulate.mutate(v, { onSuccess: () => form.resetFields() })}
            >
              <Form.Item name="from" rules={[{ required: true, message: 'Nhập số gửi' }]}>
                <Input placeholder="Số người gửi" style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="body" rules={[{ required: true, message: 'Nhập nội dung' }]}>
                <Input placeholder={`${c.prefix} 123456`} style={{ width: 200 }} />
              </Form.Item>
              <Button htmlType="submit" loading={simulate.isPending}>
                Giả lập tin bất kỳ
              </Button>
            </Form>
          </Card>
        )}
        {c && !c.simulator && <Alert type="info" showIcon title="Chế độ giả lập đang tắt (SMS_SIMULATOR=false): chỉ nhận tin thật từ cổng SMS." />}

        <Card title="Tin nhắn đến gần đây">
          <Table
            size="small"
            rowKey="id"
            loading={inbound.isLoading}
            dataSource={inbound.data ?? []}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 640 }}
            locale={{ emptyText: 'Chưa nhận tin nào' }}
            columns={[
              { title: 'Lúc', dataIndex: 'receivedAt', render: (iso: string) => `${formatTime(iso)} ${formatDate(iso)}`, width: 150 },
              { title: 'Nguồn', dataIndex: 'source', render: (s: string) => SOURCE[s] ?? s },
              { title: 'Người gửi', render: (_, m) => m.phone ?? m.fromRaw },
              { title: 'Nội dung', dataIndex: 'body' },
              { title: 'Kết quả', dataIndex: 'result', render: (r: string) => <Tag color={RESULT[r]?.color}>{RESULT[r]?.label ?? r}</Tag> },
            ]}
          />
        </Card>
      </Flex>
    </>
  );
}
