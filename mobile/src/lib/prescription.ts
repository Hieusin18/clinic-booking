import type { PrescriptionItem } from './types';

/** Tên thuốc kèm hàm lượng, vd. "Paracetamol 500mg". */
export const medicineName = (m: PrescriptionItem['medicine']) => [m.name, m.strength].filter(Boolean).join(' ');

/** Cách dùng đọc thành câu: "Mỗi lần 1 viên, 2 lần/ngày, trong 5 ngày. Uống sau ăn". */
export function usage(i: Pick<PrescriptionItem, 'dosePerTime' | 'timesPerDay' | 'days' | 'note'>) {
  const base = `Mỗi lần ${i.dosePerTime}, ${i.timesPerDay} lần/ngày, trong ${i.days} ngày.`;
  return i.note ? `${base} ${i.note}` : base;
}
