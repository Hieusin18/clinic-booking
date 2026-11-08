import dayjs, { type Dayjs } from 'dayjs';

/** Kết quả GET /stats/overview (backend/src/stats/stats.ts) */
export interface Kpis {
  visits: number;
  completed: number;
  left: number;
  patients: number;
  newPatients: number;
  onlineShare: number | null;
  waitMedian: number | null;
  waitOnlineMedian: number | null;
  waitWalkInMedian: number | null;
  examMedian: number | null;
  noShowRate: number | null;
}

export interface StatsOverview {
  range: { from: string; to: string; days: number };
  previousRange: { from: string; to: string };
  kpis: Kpis;
  previous: Kpis;
  daily: { date: string; online: number; walkIn: number; completed: number }[];
  hourly: { hour: number; online: number; walkIn: number }[];
  doctors: {
    id: string;
    name: string;
    specialty: string;
    room: string | null;
    visits: number;
    completed: number;
    waitMedian: number | null;
    examMedian: number | null;
  }[];
  diagnoses: { code: string | null; name: string; count: number }[];
  medicines: { name: string; unit: string; prescriptions: number; quantity: number }[];
  appointments: { total: number; completed: number; noShow: number; cancelled: number; upcoming: number };
  labs: { visitsWithTests: number; returnMode: number; onlineMode: number; turnaroundMedian: number | null };
}

/** Màu hai nguồn bệnh nhân (đã kiểm tra tương phản và phân biệt được với người mù màu) */
export const SOURCE_SERIES = [
  { key: 'online', name: 'Đặt online', color: '#3A3FB0' },
  { key: 'walkIn', name: 'Vãng lai', color: '#B8437E' },
] as const;

/** Số kiểu Việt Nam: 1.234 và 7,5 */
export const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
export const fmtMinutes = (n: number | null) => (n === null ? '—' : `${fmt(n)} phút`);
export const fmtPercent = (n: number | null) => (n === null ? '—' : `${fmt(n)}%`);

/**
 * So với kỳ trước: phần trăm thay đổi (số đếm) hoặc chênh lệch tuyệt đối (tỷ lệ %, phút).
 * `better` cho biết thay đổi là tốt hơn hay xấu hơn (thời gian chờ, tỷ lệ không đến: giảm là tốt);
 * `neutral`: không đánh giá tốt/xấu (vd. thời gian khám dài hơn chưa chắc là xấu).
 */
export function change(cur: number | null, prev: number | null, opts: { kind: 'count' | 'percent' | 'minutes'; lowerIsBetter?: boolean; neutral?: boolean }) {
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  if (opts.kind === 'count' && prev === 0) return null;
  const value = opts.kind === 'count' ? Math.round((diff / prev) * 1000) / 10 : Math.round(diff * 10) / 10;
  if (value === 0) return { text: 'không đổi', better: null as boolean | null, up: null as boolean | null };
  const unit = opts.kind === 'count' ? '%' : opts.kind === 'percent' ? ' điểm %' : ' phút';
  const up = value > 0;
  return { text: `${up ? '+' : '−'}${fmt(Math.abs(value))}${unit}`, up, better: opts.neutral ? null : opts.lowerIsBetter ? !up : up };
}

export type Preset = { label: string; value: [Dayjs, Dayjs] };

/** Các khoảng thời gian chọn nhanh (tính tới hôm nay) */
export function presets(today = dayjs()): Preset[] {
  const t = today.startOf('day');
  return [
    { label: '7 ngày qua', value: [t.subtract(6, 'day'), t] },
    { label: '30 ngày qua', value: [t.subtract(29, 'day'), t] },
    { label: '90 ngày qua', value: [t.subtract(89, 'day'), t] },
    { label: 'Tháng này', value: [t.startOf('month'), t] },
    { label: 'Tháng trước', value: [t.subtract(1, 'month').startOf('month'), t.subtract(1, 'month').endOf('month').startOf('day')] },
  ];
}

/** "07/11" từ "2026-11-07" */
export const shortDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
/** "07/11/2026" từ "2026-11-07" */
export const longDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Mốc trục tung "đẹp" (0, 10, 20…) cho giá trị lớn nhất `max`, khoảng 4 vạch */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

/** Chỉ hiện nhãn trục hoành cách đều để không chồng nhau */
export const labelEvery = (n: number, maxLabels: number) => Math.max(1, Math.ceil(n / maxLabels));

/** CSV (mở được bằng Excel, có BOM để giữ tiếng Việt) của các bảng chính, để đưa vào slide/báo cáo */
export function toCsv(s: StatsOverview) {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows: unknown[][] = [
    [`Thống kê ${longDate(s.range.from)} – ${longDate(s.range.to)}`],
    [],
    ['Chỉ số', 'Kỳ này', 'Kỳ trước'],
    ['Lượt tiếp nhận', s.kpis.visits, s.previous.visits],
    ['Lượt khám xong', s.kpis.completed, s.previous.completed],
    ['Bệnh nhân', s.kpis.patients, s.previous.patients],
    ['Bệnh nhân mới', s.kpis.newPatients, s.previous.newPatients],
    ['Tỷ lệ đặt online (%)', s.kpis.onlineShare, s.previous.onlineShare],
    ['Chờ trung vị (phút)', s.kpis.waitMedian, s.previous.waitMedian],
    ['Chờ trung vị – đặt online (phút)', s.kpis.waitOnlineMedian, s.previous.waitOnlineMedian],
    ['Chờ trung vị – vãng lai (phút)', s.kpis.waitWalkInMedian, s.previous.waitWalkInMedian],
    ['Khám trung vị (phút)', s.kpis.examMedian, s.previous.examMedian],
    ['Tỷ lệ không đến (%)', s.kpis.noShowRate, s.previous.noShowRate],
    [],
    ['Ngày', 'Đặt online', 'Vãng lai', 'Khám xong'],
    ...s.daily.map((d) => [longDate(d.date), d.online, d.walkIn, d.completed]),
    [],
    ['Bác sĩ', 'Chuyên khoa', 'Lượt khám xong', 'Chờ trung vị (phút)', 'Khám trung vị (phút)'],
    ...s.doctors.map((d) => [d.name, d.specialty, d.completed, d.waitMedian, d.examMedian]),
    [],
    ['Mã ICD-10', 'Chẩn đoán', 'Số lượt'],
    ...s.diagnoses.map((d) => [d.code, d.name, d.count]),
  ];
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
