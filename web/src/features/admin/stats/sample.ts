import type { StatsOverview } from './stats';

/** Dữ liệu mẫu cho test giao diện thống kê */
export const sample: StatsOverview = {
  range: { from: '2026-11-01', to: '2026-11-07', days: 7 },
  previousRange: { from: '2026-10-25', to: '2026-10-31' },
  kpis: {
    visits: 1469,
    completed: 1426,
    left: 38,
    patients: 263,
    newPatients: 9,
    onlineShare: 38.7,
    waitMedian: 7.5,
    waitOnlineMedian: 2.4,
    waitWalkInMedian: 13.8,
    examMedian: 8.3,
    noShowRate: 10.1,
  },
  previous: {
    visits: 1556,
    completed: 1508,
    left: 48,
    patients: 255,
    newPatients: 20,
    onlineShare: 27,
    waitMedian: 10.6,
    waitOnlineMedian: 2.8,
    waitWalkInMedian: 15.7,
    examMedian: 8.2,
    noShowRate: 6.9,
  },
  daily: [
    { date: '2026-11-06', online: 28, walkIn: 28, completed: 56 },
    { date: '2026-11-07', online: 2, walkIn: 5, completed: 2 },
  ],
  hourly: [
    { hour: 7, online: 3, walkIn: 10 },
    { hour: 8, online: 12, walkIn: 20 },
  ],
  doctors: [
    { id: 'd1', name: 'BSCKI Trần Thị Bình', specialty: 'Nội tổng quát', room: 'Phòng 2', visits: 249, completed: 245, waitMedian: 7.9, examMedian: 7 },
  ],
  diagnoses: [{ code: 'J02.9', name: 'Viêm họng, cấp', count: 21 }],
  medicines: [{ name: 'Paracetamol', unit: 'viên', prescriptions: 362, quantity: 3612 }],
  appointments: { total: 661, completed: 566, noShow: 64, cancelled: 28, upcoming: 3 },
  labs: { visitsWithTests: 172, returnMode: 116, onlineMode: 56, turnaroundMedian: 33 },
};
