import { CheckCircleFilled, CloseCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Descriptions, Flex, Table, Tag, Typography } from 'antd';
import { api } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/format';
import { NUM } from '../../lib/theme';
import { PageHeader } from './PageHeader';

interface SmsConfig {
  smsTo: string | null;
  iphoneShortcut: boolean;
  androidGateway: boolean;
  prefix: string;
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

const SOURCE: Record<string, string> = { IOS_SHORTCUT: 'iPhone Phím tắt', ANDROID_GATEWAY: 'Android Gateway' };
const RESULT: Record<string, { label: string; color: string }> = {
  VERIFIED: { label: 'Đã xác minh', color: 'success' },
  WRONG_SENDER: { label: 'Sai số người gửi', color: 'error' },
  INVALID_SENDER: { label: 'Người gửi không phải số ĐT', color: 'warning' },
  NO_MATCH: { label: 'Không khớp mã', color: 'default' },
};

const Yes = ({ on, label }: { on: boolean; label: string }) => (
  <span>
    {on ? <CheckCircleFilled style={{ color: '#2E7A57' }} /> : <CloseCircleOutlined style={{ color: '#9AA3B5' }} />} {label}
  </span>
);

/**
 * Tin nhắn xác minh số điện thoại (backend/src/sms/phone-verify.ts): bệnh nhân nhắn "PKXM <mã>" tới số của
 * phòng khám; cổng SMS (iPhone Phím tắt / Android) chuyển tin về máy chủ. Trang này để kiểm tra cổng có hoạt động.
 */
export function SmsPage() {
  const config = useQuery({ queryKey: ['sms', 'config'], queryFn: async () => (await api.get<SmsConfig>('/sms/config')).data });
  const inbound = useQuery({ queryKey: ['sms', 'inbound'], queryFn: async () => (await api.get<Inbound[]>('/sms/inbound')).data, refetchInterval: 3000 });
  const c = config.data;

  return (
    <>
      <PageHeader title="Tin nhắn xác minh" />
      <Flex vertical gap={16}>
        {c && (
          <Card size="small">
            <Descriptions size="small" column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Số nhận tin">
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
                </Flex>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {c && (!c.smsTo || (!c.iphoneShortcut && !c.androidGateway)) && (
          <Alert
            type="warning"
            showIcon
            title="Cổng SMS chưa cấu hình đủ: bệnh nhân chưa đăng ký / lấy lại mật khẩu được"
            description="Đặt SMS_VERIFY_NUMBER (số SIM của máy cổng) và SMS_GATEWAY_TOKEN (iPhone Phím tắt) hoặc SMS_GATEWAY_SIGNING_KEY (Android) trong .env, xem README."
          />
        )}

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
