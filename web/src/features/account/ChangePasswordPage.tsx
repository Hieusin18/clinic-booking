import { CheckCircleFilled, CloseCircleOutlined, LogoutOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Divider, Flex, Form, Input, Popconfirm, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../../lib/api';
import { HOME_BY_ROLE, useAuth } from '../../lib/auth';
import { passwordChecks } from '../../lib/password';
import { C } from '../../lib/theme';
import type { User } from '../../lib/types';
import { useAction } from '../../lib/hooks';

type Values = { currentPassword: string; newPassword: string; confirm: string };

/**
 * Đổi mật khẩu cho mọi nhân viên. Tài khoản đang dùng mật khẩu tạm (admin vừa tạo hoặc đặt lại)
 * bị đưa thẳng tới đây và chưa dùng được chức năng nào khác cho tới khi đổi xong.
 */
export function ChangePasswordPage() {
  const { user, updateSession, logout } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const newPassword = Form.useWatch('newPassword', form) ?? '';
  const forced = !!user?.mustChangePassword;
  const checks = passwordChecks(newPassword, user?.phone);

  const change = useAction(
    async (v: Values) =>
      (await api.post<{ accessToken: string; user: User }>('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword })).data,
    { handleError: () => true },
  );
  const logoutAll = useAction(() => api.post('/auth/logout-all'));

  const submit = async (v: Values) => {
    try {
      const r = await change.mutateAsync(v);
      updateSession(r.accessToken, r.user);
      message.success('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.');
      form.resetFields();
      if (forced) navigate(HOME_BY_ROLE[r.user.role], { replace: true });
    } catch {
      // lỗi hiện trong khung bên dưới
    }
  };

  return (
    <Flex justify="center">
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Đổi mật khẩu
        </Typography.Title>
        {forced && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="Bạn đang dùng mật khẩu tạm"
            description="Mật khẩu này do quản trị viên cấp. Hãy đặt mật khẩu của riêng bạn để tiếp tục làm việc."
          />
        )}
        {change.error && <Alert type="error" showIcon title={errorMessage(change.error)} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => void submit(v)}>
          <Form.Item
            label={forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}
            name="currentPassword"
            rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}
          >
            <Input.Password autoComplete="current-password" autoFocus />
          </Form.Item>
          <Form.Item
            label="Mật khẩu mới"
            name="newPassword"
            rules={[
              { required: true, message: 'Nhập mật khẩu mới' },
              {
                validator: (_, v: string) =>
                  !v || passwordChecks(v, user?.phone).every((c) => c.ok) ? Promise.resolve() : Promise.reject(new Error('Mật khẩu mới chưa đạt yêu cầu')),
              },
            ]}
            extra={
              <Flex vertical gap={2} style={{ marginTop: 6 }} aria-live="polite">
                {checks.map((c) => (
                  <span key={c.label} style={{ color: c.ok ? C.good : C.muted, fontSize: 13 }}>
                    {c.ok ? <CheckCircleFilled /> : <CloseCircleOutlined />} {c.label}
                  </span>
                ))}
              </Flex>
            }
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="Nhập lại mật khẩu mới"
            name="confirm"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Nhập lại mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator: (_, v: string) =>
                  !v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại không khớp')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Flex gap={8} wrap>
            <Button type="primary" htmlType="submit" loading={change.isPending}>
              Đổi mật khẩu
            </Button>
            {forced && <Button onClick={logout}>Đăng xuất</Button>}
          </Flex>
        </Form>

        {!forced && (
          <>
            <Divider />
            <Typography.Text strong>Đăng xuất khỏi mọi thiết bị</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 12px' }}>
              Dùng khi bạn quên đăng xuất ở máy dùng chung hoặc nghi ngờ người khác biết mật khẩu. Máy này cũng sẽ phải đăng nhập lại.
            </Typography.Paragraph>
            <Popconfirm
              title="Đăng xuất khỏi mọi thiết bị?"
              okText="Đăng xuất hết"
              cancelText="Hủy"
              onConfirm={() => logoutAll.mutateAsync(undefined).then(logout, () => undefined)}
            >
              <Button danger icon={<LogoutOutlined />} loading={logoutAll.isPending}>
                Đăng xuất mọi thiết bị
              </Button>
            </Popconfirm>
          </>
        )}
      </Card>
    </Flex>
  );
}
