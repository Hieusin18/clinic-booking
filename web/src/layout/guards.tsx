import { Result, Spin } from 'antd';
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
  if (!roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <>{children}</>;
}

export function PatientOnly() {
  return (
    <Result
      status="info"
      title="Trang quản lý dành cho nhân viên phòng khám"
      subTitle="Bệnh nhân vui lòng dùng ứng dụng trên điện thoại để đặt lịch và lấy số."
    />
  );
}
