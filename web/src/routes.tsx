import { Navigate, type RouteObject } from 'react-router';
import { DoctorsPage } from './features/admin/DoctorsPage';
import { MedicinesPage } from './features/admin/MedicinesPage';
import { ReceptionistsPage } from './features/admin/ReceptionistsPage';
import { SpecialtiesPage } from './features/admin/SpecialtiesPage';
import { LoginPage } from './features/auth/LoginPage';
import { AppLayout } from './layout/AppLayout';
import { ComingSoon, RequireRole } from './layout/guards';
import { HOME_BY_ROLE, useAuth } from './lib/auth';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />;
}

/**
 * Bảng định tuyến. Mỗi chức năng thay trang ComingSoon của mình bằng trang thật:
 * - Tài khoản và quản trị: /login, /admin/*
 * - Lịch khám: /doctor/schedule
 * - Tiếp đón và hàng đợi: /reception, /reception/queue, /counter
 * - Khám bệnh: /doctor/queue
 */
export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/counter',
    element: (
      <RequireRole roles={['RECEPTIONIST', 'ADMIN']}>
        <ComingSoon title="Màn hình quầy" />
      </RequireRole>
    ),
  },
  {
    element: <AppLayout />,
    children: [
      {
        path: '/admin',
        element: <RequireRole roles={['ADMIN']}><Navigate to="/admin/specialties" replace /></RequireRole>,
      },
      { path: '/admin/specialties', element: <RequireRole roles={['ADMIN']}><SpecialtiesPage /></RequireRole> },
      { path: '/admin/doctors', element: <RequireRole roles={['ADMIN']}><DoctorsPage /></RequireRole> },
      { path: '/admin/receptionists', element: <RequireRole roles={['ADMIN']}><ReceptionistsPage /></RequireRole> },
      { path: '/admin/medicines', element: <RequireRole roles={['ADMIN']}><MedicinesPage /></RequireRole> },
      { path: '/doctor/queue', element: <RequireRole roles={['DOCTOR']}><ComingSoon title="Khám bệnh" /></RequireRole> },
      { path: '/doctor/schedule', element: <RequireRole roles={['DOCTOR']}><ComingSoon title="Lịch làm việc" /></RequireRole> },
      { path: '/reception', element: <RequireRole roles={['RECEPTIONIST']}><ComingSoon title="Tiếp đón" /></RequireRole> },
      { path: '/reception/queue', element: <RequireRole roles={['RECEPTIONIST']}><ComingSoon title="Hàng đợi hôm nay" /></RequireRole> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
