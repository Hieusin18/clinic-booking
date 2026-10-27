import { LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../../lib/api';
import { HOME_BY_ROLE, useAuth } from '../../lib/auth';

interface LoginForm {
  phone: string;
  password: string;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  async function onFinish(values: LoginForm) {
    setSubmitting(true);
    setError(null);
    try {
      const u = await login(values.phone.trim(), values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : HOME_BY_ROLE[u.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f0fdfa 0%, #f8fafc 60%)', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }} styles={{ body: { padding: 32 } }}>
        <Flex vertical align="center" gap={8} style={{ marginBottom: 24 }}>
          <img src="/favicon.svg" width={48} height={48} alt="" />
          <Typography.Title level={3} style={{ margin: 0 }}>Phòng khám</Typography.Title>
          <Typography.Text type="secondary">Đăng nhập dành cho nhân viên</Typography.Text>
        </Flex>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item
            label="Số điện thoại"
            name="phone"
            rules={[
              { required: true, message: 'Nhập số điện thoại' },
              { pattern: /^0\d{9}$/, message: 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0' },
            ]}
          >
            <Input prefix={<PhoneOutlined />} placeholder="09xxxxxxxx" autoComplete="username" inputMode="tel" />
          </Form.Item>
          <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </Flex>
  );
}
