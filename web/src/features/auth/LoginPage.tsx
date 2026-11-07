import { LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '../../layout/Logo';
import { errorMessage } from '../../lib/api';
import { HOME_BY_ROLE, useAuth } from '../../lib/auth';
import { C } from '../../lib/theme';

interface LoginForm {
  phone: string;
  password: string;
}

/** Hình phiếu số minh họa ở nửa trái màn hình đăng nhập. */
function TicketArt() {
  return (
    <div aria-hidden style={{ width: 260, background: '#fff', borderRadius: 18, color: C.ink, boxShadow: '0 24px 60px rgba(0,0,0,.35)', transform: 'rotate(-4deg)' }}>
      <div style={{ padding: '18px 22px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>BS. Trần Minh Quân</div>
        <div style={{ color: C.muted, fontSize: 13 }}>Nội tổng quát · Phòng 2</div>
      </div>
      <div style={{ borderTop: `2px dashed ${C.line}`, margin: '0 18px' }} />
      <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
        <div style={{ color: C.muted, fontSize: 13 }}>Số của bạn</div>
        <div className="num" style={{ fontSize: 108, lineHeight: 1, fontWeight: 700, color: C.stamp }}>A07</div>
      </div>
      <div style={{ borderTop: `2px dashed ${C.line}`, margin: '10px 18px 0' }} />
      <Flex justify="space-around" style={{ padding: '12px 10px 16px', textAlign: 'center' }}>
        {[
          ['Đang khám', 'A05'],
          ['Trước bạn', '1'],
          ['Dự kiến', '08:24'],
        ].map(([k, v], i) => (
          <div key={k}>
            <div style={{ color: C.muted, fontSize: 12 }}>{k}</div>
            <div className="num" style={{ fontSize: 26, fontWeight: 700, color: i === 2 ? C.stamp : C.ink }}>{v}</div>
          </div>
        ))}
      </Flex>
    </div>
  );
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
    <div className="login-split" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', background: C.paper }}>
      <Flex className="login-art" vertical justify="space-between" style={{ background: C.ink, color: '#fff', padding: '40px 48px', overflow: 'hidden' }}>
        <Flex align="center" gap={12}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 0 }}>
            <Logo size={36} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 17 }}>Phòng khám</span>
        </Flex>
        <Flex justify="center" style={{ padding: '32px 0' }}>
          <TicketArt />
        </Flex>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3 }}>Đặt lịch trước, được gọi trước.</div>
          <div style={{ color: '#B9C0CC', marginTop: 8, maxWidth: 420 }}>
            Tiếp đón, hàng đợi, khám bệnh và kê đơn trong một nơi. Bệnh nhân theo dõi số thứ tự ngay trên điện thoại.
          </div>
        </div>
      </Flex>
      <Flex align="center" justify="center" style={{ padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Đăng nhập
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 28 }}>
            Dành cho bác sĩ, lễ tân và quản trị viên
          </Typography.Paragraph>
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
            <Button type="primary" htmlType="submit" block loading={submitting} style={{ background: C.ink, height: 48 }}>
              Đăng nhập
            </Button>
          </Form>
          <Typography.Paragraph type="secondary" style={{ marginTop: 20, fontSize: 13 }}>
            Bệnh nhân vui lòng dùng ứng dụng trên điện thoại để đặt lịch và lấy số.
          </Typography.Paragraph>
        </div>
      </Flex>
    </div>
  );
}
