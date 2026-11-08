import { CheckCircleOutlined, MobileOutlined, SafetyCertificateOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Popconfirm, Tag, Typography } from 'antd';
import { api } from '../../lib/api';
import { formatDay } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { NUM } from '../../lib/theme';

/** Tình trạng tài khoản app của một hồ sơ (backend/src/patients/account-link.ts) */
export interface AppAccountInfo {
  status: 'NONE' | 'UNVERIFIED' | 'VERIFIED';
  linkCode: string;
  registeredAt: string | null;
  verifiedAt: string | null;
}

export const useAppAccount = (patientId: string | undefined) =>
  useQuery({
    queryKey: ['patient-account', patientId],
    enabled: !!patientId,
    queryFn: async () => (await api.get<AppAccountInfo>(`/patients/${patientId}/account`)).data,
  });

/** Mã liên kết dạng "ABC 234" cho dễ đọc */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * Ô "Tài khoản app" ở quầy tiếp đón:
 *  - chưa có tài khoản: đưa mã liên kết để bệnh nhân tự liên kết sau khi đăng ký;
 *  - tài khoản chưa xác minh: đối chiếu CCCD rồi bấm Xác minh; nếu không phải chính chủ đăng ký thì Gỡ tài khoản.
 */
export function AppAccount({ patientId }: { patientId: string }) {
  const account = useAppAccount(patientId);
  const verify = useAction(() => api.post(`/patients/${patientId}/account/verify`), {
    success: 'Đã xác minh, bệnh nhân xem được toàn bộ lịch sử khám trên app',
    invalidate: ['patient-account'],
  });
  const detach = useAction(() => api.post(`/patients/${patientId}/account/detach`), {
    success: 'Đã gỡ tài khoản. Bệnh nhân có thể đăng ký lại bằng số điện thoại này.',
    invalidate: ['patient-account'],
  });
  const a = account.data;
  if (!a?.linkCode) return null;

  const code = (
    <Typography.Text copyable={{ text: a.linkCode }} style={{ fontFamily: NUM, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
      {spacedCode(a.linkCode)}
    </Typography.Text>
  );

  if (a.status === 'NONE') {
    return (
      <Flex align="center" gap={8} wrap style={{ marginBottom: 12 }}>
        <Tag icon={<MobileOutlined />}>Chưa dùng app</Tag>
        <Typography.Text type="secondary">Mã liên kết để xem lịch sử khám trên app:</Typography.Text>
        {code}
      </Flex>
    );
  }
  if (a.status === 'VERIFIED') {
    return (
      <Flex align="center" gap={8} wrap style={{ marginBottom: 12 }}>
        <Tag icon={<CheckCircleOutlined />} color="success">
          Tài khoản app đã xác minh
        </Tag>
      </Flex>
    );
  }
  return (
    <Alert
      type="warning"
      showIcon
      icon={<SafetyCertificateOutlined />}
      style={{ marginBottom: 12 }}
      title={`Tài khoản app đăng ký ngày ${a.registeredAt ? formatDay(a.registeredAt) : '—'} chưa xác minh`}
      description={
        <Flex vertical gap={8}>
          <span>
            Lịch sử khám cũ đang bị ẩn trên app. Nếu người trước quầy là chính chủ, đối chiếu CCCD rồi bấm Xác minh (hoặc đưa mã {code} để họ tự nhập).
          </span>
          <Flex gap={8} wrap>
            <Popconfirm
              title="Đã đối chiếu CCCD đúng người?"
              okText="Xác minh"
              cancelText="Hủy"
              onConfirm={() => verify.mutateAsync(undefined).catch(() => undefined)}
            >
              <Button size="small" type="primary" icon={<SafetyCertificateOutlined />} loading={verify.isPending}>
                Xác minh chính chủ
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Gỡ tài khoản này khỏi hồ sơ?"
              description="Dùng khi người khác đã đăng ký bằng số của bệnh nhân. Tài khoản đó bị khóa, chính chủ đăng ký lại được."
              okText="Gỡ tài khoản"
              okButtonProps={{ danger: true }}
              cancelText="Hủy"
              onConfirm={() => detach.mutateAsync(undefined).catch(() => undefined)}
            >
              <Button size="small" danger icon={<UserDeleteOutlined />} loading={detach.isPending}>
                Không phải chính chủ
              </Button>
            </Popconfirm>
          </Flex>
        </Flex>
      }
    />
  );
}
