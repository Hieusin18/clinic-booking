import {
  CalendarOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  QrcodeOutlined,
  SolutionOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
  ApartmentOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Flex, Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { ROLE_LABEL, useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { PatientOnly } from './guards';

type Item = Required<MenuProps>['items'][number] & { key: string };
const item = (key: string, label: string, icon: ReactNode): Item => ({ key, label, icon });

/** Menu bên trái theo vai trò. key = đường dẫn trang. */
export const MENU_BY_ROLE: Record<Exclude<Role, 'PATIENT'>, Item[]> = {
  ADMIN: [
    item('/admin/specialties', 'Chuyên khoa', <ApartmentOutlined />),
    item('/admin/doctors', 'Bác sĩ', <TeamOutlined />),
    item('/admin/receptionists', 'Lễ tân', <IdcardOutlined />),
    item('/admin/medicines', 'Danh mục thuốc', <MedicineBoxOutlined />),
  ],
  DOCTOR: [
    item('/doctor/queue', 'Khám bệnh', <SolutionOutlined />),
    item('/doctor/schedule', 'Lịch làm việc', <CalendarOutlined />),
  ],
  RECEPTIONIST: [
    item('/reception', 'Tiếp đón', <UserOutlined />),
    item('/reception/queue', 'Hàng đợi hôm nay', <UnorderedListOutlined />),
    item('/counter', 'Màn hình quầy (QR)', <QrcodeOutlined />),
  ],
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Đăng xuất hoặc token hết hạn (401) → về trang đăng nhập, không để trang trắng
  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  if (user.role === 'PATIENT') return <PatientOnly />;

  const items = MENU_BY_ROLE[user.role];
  // Mục đang chọn = mục có đường dẫn dài nhất khớp với trang hiện tại
  const selected = items.filter((i) => pathname === i.key || pathname.startsWith(`${i.key}/`)).sort((a, b) => b.key.length - a.key.length)[0]?.key;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={0} width={232} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <Flex align="center" gap={10} style={{ padding: '20px 20px 16px' }}>
          <img src="/favicon.svg" width={32} height={32} alt="" />
          <div>
            <Typography.Text strong style={{ display: 'block', lineHeight: 1.2 }}>Phòng khám</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{ROLE_LABEL[user.role]}</Typography.Text>
          </div>
        </Flex>
        <Menu
          mode="inline"
          selectedKeys={selected ? [selected] : []}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Flex justify="flex-end" align="center" gap={12} style={{ height: '100%' }}>
            <Avatar style={{ background: '#0f766e' }}>{user.fullName.trim().split(' ').pop()?.[0]?.toUpperCase()}</Avatar>
            <Typography.Text>{user.fullName}</Typography.Text>
            <Button icon={<LogoutOutlined />} onClick={logout}>Đăng xuất</Button>
          </Flex>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
