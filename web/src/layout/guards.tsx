import { Button, Flex, Result, Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { HOME_BY_ROLE, useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

/** Chặn trang theo vai trò: chưa đăng nhập → trang đăng nhập; sai vai trò → về trang của mình. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spin size="large" fullscreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role === 'PATIENT') return <PatientOnly />;
  // Đang dùng mật khẩu tạm: chỉ được vào trang đổi mật khẩu
  if (user.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <>{children}</>;
}

export const CHANGE_PASSWORD_PATH = '/account/password';

/** Tài khoản bệnh nhân đăng nhập vào trang quản lý: hướng dẫn dùng app, cho đăng xuất để đổi tài khoản. */
export function PatientOnly() {
  const { logout } = useAuth();
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16 }}>
      <Result
        status="info"
        title="Trang quản lý dành cho nhân viên phòng khám"
        subTitle="Bệnh nhân vui lòng dùng ứng dụng trên điện thoại để đặt lịch và lấy số."
        extra={
          <Button type="primary" onClick={logout}>
            Đăng xuất, dùng tài khoản khác
          </Button>
        }
      />
    </Flex>
  );
}

/**
 * Trang chủ của tài khoản bệnh nhân (/patient-only). Trước đây đường dẫn này không có trong bảng định tuyến
 * nên bị chuyển về "/" rồi lại về đây, lặp vô hạn và trang trắng.
 */
export function PatientOnlyPage() {
  const { user, loading } = useAuth();
  if (loading) return <Spin size="large" fullscreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PATIENT') return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <PatientOnly />;
}
